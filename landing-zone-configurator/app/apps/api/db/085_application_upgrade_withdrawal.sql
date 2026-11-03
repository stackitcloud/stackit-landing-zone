-- A withdrawal is a fresh immutable desired snapshot, never a pointer rewind.
-- Existing Plan bindings therefore cannot become valid again (including ABA).
DO $$ DECLARE constraint_name text;
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='lzc.application_upgrade_candidates'::regclass AND contype='c' AND position('kind' IN pg_get_constraintdef(oid))>0)<>2 THEN
  RAISE EXCEPTION 'application_upgrade_candidate_constraints_changed';
 END IF;
 FOR constraint_name IN SELECT conname FROM pg_constraint
 WHERE conrelid='lzc.application_upgrade_candidates'::regclass AND contype='c'
 AND position('kind' IN pg_get_constraintdef(oid))>0 LOOP
  EXECUTE format('ALTER TABLE lzc.application_upgrade_candidates DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
ALTER TABLE lzc.application_upgrade_candidates ADD COLUMN restored_apply_job_id uuid REFERENCES lzc.application_jobs(id);
ALTER TABLE lzc.application_upgrade_candidates ADD CONSTRAINT application_upgrade_withdrawal_receipt
 CHECK(kind='withdrawal' OR restored_apply_job_id IS NULL);
ALTER TABLE lzc.application_upgrade_candidates ADD CONSTRAINT application_upgrade_candidate_kind
 CHECK(kind IN ('template','platform','withdrawal'));
ALTER TABLE lzc.application_upgrade_candidates ADD CONSTRAINT application_upgrade_candidate_edge
 CHECK((kind='template' AND edge_id IS NOT NULL AND platform_edge_id IS NULL)
 OR (kind='platform' AND edge_id IS NULL AND platform_edge_id IS NOT NULL)
 OR (kind='withdrawal' AND edge_id IS NULL AND platform_edge_id IS NULL));

CREATE FUNCTION lzc_auth.application_upgrade_withdrawal_context(p_session uuid,p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; candidate lzc.application_upgrade_candidates;
 applied lzc.application_jobs; restored lzc.application_instances; blockers jsonb; restore_platform uuid;
BEGIN
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 SELECT j.* INTO applied FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id
 WHERE j.instance_id=p_instance AND j.operation='apply' AND d.status='succeeded' AND d.finished_at IS NOT NULL AND coalesce(j.inputs->>'purpose','standard')<>'destroy'
 ORDER BY d.finished_at DESC,j.created_at DESC,j.id DESC LIMIT 1;
 restored:=CASE WHEN applied.id IS NULL THEN ordered ELSE lzc_auth.application_job_order(applied.id) END;
 blockers:=lzc_auth.application_execution_blockers(p_instance);
 IF applied.id IS NULL THEN
  SELECT platform_revision INTO restore_platform FROM lzc.application_template_versions WHERE id=restored.version_id AND tenant_id=ordered.tenant_id;
 ELSE restore_platform:=lzc_auth.application_job_platform_revision(applied.id); END IF;
 IF ordered.requested_by=lzc.current_user_id() AND (restore_platform IS NULL OR NOT lzc_auth.application_upgrade_platform_current(p_session,restore_platform)) THEN
  blockers:=blockers||'"restore-platform-unavailable"'::jsonb;
 END IF;
 IF ordered.requested_by<>lzc.current_user_id() THEN blockers:=blockers||'"requester-required"'::jsonb; END IF;
 IF candidate.id IS NULL OR candidate.kind='withdrawal' OR candidate.id::text IS NOT DISTINCT FROM applied.inputs->>'applicationUpgradeId' THEN
  blockers:=blockers||'"no-pending-upgrade"'::jsonb;
 END IF;
 -- Even a failed/prepared Apply may have material or an outstanding approval.
 -- Metadata withdrawal must not pretend that a partial cloud Apply was undone.
 IF EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.instance_id=p_instance AND j.operation='apply'
  AND (applied.id IS NULL OR (j.created_at,j.id)>(applied.created_at,applied.id)
   OR EXISTS(SELECT 1 FROM lzc.application_upgrade_candidates attempt WHERE attempt.id=(j.inputs->>'applicationUpgradeId')::uuid AND attempt.instance_id=p_instance
    AND attempt.sequence>coalesce((SELECT sequence FROM lzc.application_upgrade_candidates baseline WHERE baseline.id=(applied.inputs->>'applicationUpgradeId')::uuid AND baseline.instance_id=p_instance),0)))) THEN
  blockers:=blockers||'"apply-attempt-after-baseline"'::jsonb;
 END IF;
 RETURN jsonb_build_object('canWithdraw',jsonb_array_length(blockers)=0,'blockers',blockers,
  'expectedBindingId',candidate.id,'expectedVersionId',(lzc_auth.effective_application_order(p_instance)).version_id,
  'lastAppliedJobId',applied.id,'restoreVersionId',restored.version_id);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_withdrawal_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_withdrawal_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.withdraw_application_upgrade(p_session uuid,p_instance uuid,p_expected_binding uuid,p_expected_version uuid,p_expected_apply uuid,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; ordered lzc.application_instances; restored lzc.application_instances;
 candidate lzc.application_upgrade_candidates; applied lzc.application_jobs; source text; platform uuid;
 execution_binding uuid; candidate_id uuid:=gen_random_uuid(); snapshot jsonb;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id();
 IF p_confirm IS DISTINCT FROM true OR ordered.requested_by<>lzc.current_user_id() THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 context:=lzc_auth.application_upgrade_withdrawal_context(p_session,p_instance);
 IF context->>'expectedBindingId' IS DISTINCT FROM p_expected_binding::text OR context->>'expectedVersionId' IS DISTINCT FROM p_expected_version::text
  OR context->>'lastAppliedJobId' IS DISTINCT FROM p_expected_apply::text THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='40001'; END IF;
 IF context->>'canWithdraw' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'application_upgrade_withdrawal_blocked' USING ERRCODE='40001'; END IF;
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=p_expected_binding AND instance_id=p_instance;
 IF p_expected_apply IS NULL THEN
  restored:=ordered;
  SELECT platform_revision INTO platform FROM lzc.application_template_versions WHERE id=ordered.version_id AND tenant_id=ordered.tenant_id;
 ELSE
  SELECT * INTO applied FROM lzc.application_jobs WHERE id=p_expected_apply AND instance_id=p_instance;
  restored:=lzc_auth.application_job_order(applied.id);
  platform:=lzc_auth.application_job_platform_revision(applied.id);
 END IF;
 IF platform IS NULL THEN RAISE EXCEPTION 'application_upgrade_withdrawal_blocked' USING ERRCODE='40001'; END IF;
 -- Technical execution maintenance is independent; never downgrade its source.
 source:=lzc_auth.effective_application_revision(p_instance);
 SELECT id INTO execution_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 snapshot:=jsonb_build_object('id',candidate_id,'kind','withdrawal','previousBindingId',candidate.id,'lastAppliedJobId',p_expected_apply,
 'instanceId',p_instance,'versionId',restored.version_id,'platformRevision',platform,'parameters',restored.parameters,
 'resolvedSettings',restored.resolved_settings,'deploymentPolicy',restored.deployment_policy,'sourceRevision',source,'executionBindingId',execution_binding);
 UPDATE lzc.application_job_grants g SET revoked_at=now() FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance
 AND j.operation='plan' AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims consumed WHERE consumed.job_id=g.job_id);
 INSERT INTO lzc.application_upgrade_candidates(id,tenant_id,instance_id,sequence,kind,previous_binding_id,version_id,platform_revision,
 parameters,resolved_settings,deployment_policy,source_revision,execution_binding_id,candidate_hash,requested_by,issuer_session_id,sensitive_policy,restored_apply_job_id)
 VALUES(candidate_id,ordered.tenant_id,p_instance,candidate.sequence+1,'withdrawal',candidate.id,restored.version_id,platform,
 restored.parameters,restored.resolved_settings,restored.deployment_policy,source,execution_binding,
 encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),ordered.requested_by,p_session,'approval-required',p_expected_apply);
 RETURN lzc_auth.application_upgrade_context(p_session,p_instance);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.withdraw_application_upgrade(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.withdraw_application_upgrade(uuid,uuid,uuid,uuid,uuid,boolean) TO configurator_app;
