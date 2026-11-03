-- A terminal Plan cannot use its Runner ticket again. Do not make the user wait
-- for that ticket's TTL before changing metadata; Apply and recovery stay guarded.
DO $migration$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.application_execution_blockers(uuid)'::regprocedure);
 anchor:=$anchor$j.instance_id=p_instance AND t.expires_at>now()$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'settled_plan_ticket_anchor_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$j.instance_id=p_instance AND t.expires_at>now()
  AND NOT (j.operation='plan' AND EXISTS(SELECT 1 FROM lzc.application_dispatches settled WHERE settled.job_id=j.id AND settled.finished_at IS NOT NULL AND settled.status IN ('succeeded','failed','cancelled')))$replacement$);
END $migration$;

CREATE FUNCTION lzc_auth.application_upgrade_policy_update(p_session uuid,p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected lzc.application_upgrade_candidates; edge_id uuid; policy jsonb; blockers jsonb;
BEGIN
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO selected FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 IF selected.kind='template' THEN
  SELECT latest.id,latest.policy INTO edge_id,policy FROM lzc.application_upgrade_edges old
  JOIN lzc.application_upgrade_edges latest ON latest.tenant_id=old.tenant_id AND latest.from_version_id=old.from_version_id AND latest.to_version_id=old.to_version_id
  WHERE old.id=selected.edge_id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1;
 ELSIF selected.kind='platform' THEN
  SELECT latest.id,latest.policy INTO edge_id,policy FROM lzc.application_platform_upgrade_edges old
  JOIN lzc.application_platform_upgrade_edges latest ON latest.tenant_id=old.tenant_id AND latest.from_revision=old.from_revision AND latest.to_revision=old.to_revision
  WHERE old.id=selected.platform_edge_id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1;
 END IF;
 IF edge_id IS NULL OR policy->>'sensitive'=selected.sensitive_policy THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(b),'[]'::jsonb) INTO blockers FROM jsonb_array_elements(lzc_auth.application_upgrade_withdrawal_context(p_session,p_instance)->'blockers') b WHERE b<>'"restore-platform-unavailable"'::jsonb;
 RETURN jsonb_build_object('edgeId',edge_id,'sensitivePolicy',policy->>'sensitive','canRefresh',jsonb_array_length(blockers)=0,'blockers',blockers);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_policy_update(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_policy_update(uuid,uuid) TO configurator_app;

-- Adopt a newly published policy explicitly, keeping the exact target/settings.
-- Append a fresh binding so old Plans cannot acquire permission retroactively.
CREATE FUNCTION lzc_auth.refresh_application_upgrade_policy(p_session uuid,p_instance uuid,p_expected_binding uuid,p_expected_version uuid,p_expected_apply uuid,p_edge uuid,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected lzc.application_upgrade_candidates; ordered lzc.application_instances; context jsonb; latest jsonb;
 candidate_id uuid:=gen_random_uuid(); snapshot jsonb; policy text;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF ordered.requested_by<>lzc.current_user_id() OR p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 context:=lzc_auth.application_upgrade_withdrawal_context(p_session,p_instance);
 IF context->>'expectedBindingId' IS DISTINCT FROM p_expected_binding::text OR context->>'expectedVersionId' IS DISTINCT FROM p_expected_version::text
  OR context->>'lastAppliedJobId' IS DISTINCT FROM p_expected_apply::text THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(context->'blockers') b WHERE b<>'"restore-platform-unavailable"'::jsonb) THEN RAISE EXCEPTION 'application_upgrade_withdrawal_blocked' USING ERRCODE='40001'; END IF;
 SELECT * INTO selected FROM lzc.application_upgrade_candidates WHERE id=p_expected_binding AND instance_id=p_instance;
 IF selected.kind='template' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('application_upgrade_edges:'||selected.tenant_id::text||':'||e.from_version_id::text||':'||e.to_version_id::text,0)) FROM lzc.application_upgrade_edges e WHERE e.id=selected.edge_id;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('application_platform_upgrade_edges:'||selected.tenant_id::text||':'||e.from_revision::text||':'||e.to_revision::text,0)) FROM lzc.application_platform_upgrade_edges e WHERE e.id=selected.platform_edge_id;
 END IF;
 latest:=lzc_auth.application_upgrade_policy_update(p_session,p_instance);
 IF latest IS NULL OR latest->>'edgeId' IS DISTINCT FROM p_edge::text THEN RAISE EXCEPTION 'application_upgrade_edge_unavailable' USING ERRCODE='40001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:'||selected.tenant_id::text||':'||selected.version_id::text,0));
 IF NOT lzc_auth.application_template_group_access(selected.tenant_id,selected.requested_by,selected.version_id)
  OR EXISTS(SELECT 1 FROM lzc.application_template_retirements WHERE version_id=selected.version_id)
  OR EXISTS(SELECT 1 FROM lzc.application_template_deletions WHERE version_id=selected.version_id)
  OR NOT lzc_auth.application_upgrade_platform_current(p_session,selected.platform_revision)
  OR selected.source_revision IS DISTINCT FROM lzc_auth.effective_application_revision(p_instance)
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=selected.source_revision AND status='supported')
 THEN RAISE EXCEPTION 'application_upgrade_target_unavailable' USING ERRCODE='42501'; END IF;
 policy:=latest->>'sensitivePolicy';
 snapshot:=jsonb_build_object('id',candidate_id,'kind',selected.kind,'previousBindingId',selected.id,'instanceId',p_instance,
 'edgeId',p_edge,'versionId',selected.version_id,'platformRevision',selected.platform_revision,'parameters',selected.parameters,
 'resolvedSettings',selected.resolved_settings,'deploymentPolicy',policy,'sourceRevision',selected.source_revision,'executionBindingId',selected.execution_binding_id,'sensitivePolicy',policy);
 UPDATE lzc.application_job_grants g SET revoked_at=now() FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance
 AND j.operation='plan' AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims consumed WHERE consumed.job_id=g.job_id);
 INSERT INTO lzc.application_upgrade_candidates(id,tenant_id,instance_id,sequence,kind,edge_id,platform_edge_id,previous_binding_id,version_id,platform_revision,
 parameters,resolved_settings,deployment_policy,source_revision,execution_binding_id,candidate_hash,requested_by,issuer_session_id,sensitive_policy)
 VALUES(candidate_id,selected.tenant_id,p_instance,selected.sequence+1,selected.kind,CASE WHEN selected.kind='template' THEN p_edge END,
 CASE WHEN selected.kind='platform' THEN p_edge END,selected.id,selected.version_id,selected.platform_revision,selected.parameters,selected.resolved_settings,
 policy,selected.source_revision,selected.execution_binding_id,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),selected.requested_by,p_session,policy);
 RETURN lzc_auth.application_upgrade_context(p_session,p_instance);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.refresh_application_upgrade_policy(uuid,uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.refresh_application_upgrade_policy(uuid,uuid,uuid,uuid,uuid,uuid,boolean) TO configurator_app;

DO $migration$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.application_upgrade_approval_context(uuid,uuid)'::regprocedure);
 anchor:=$anchor$'requiresApproval',coalesce(required,true)$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_policy_notice_anchor_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$'policyUpdateAvailable',lzc_auth.application_upgrade_policy_update(p_session,job.instance_id) IS NOT NULL,'requiresApproval',coalesce(required,true)$replacement$);
END $migration$;
