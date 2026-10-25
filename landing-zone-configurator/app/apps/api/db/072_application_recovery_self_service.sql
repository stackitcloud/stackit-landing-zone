-- Self-service is limited to the original order owner with an unrevoked
-- execution delegation and verified matching identity. Manual operator
-- attestation and credential-profile access are not widened.
CREATE FUNCTION lzc_auth.guided_application_recovery_base_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; dispatched lzc.application_dispatches;
 grant_row lzc.application_job_grants; bound lzc.application_job_backends; registered lzc.state_backends; descriptor_hash text; review_mode text;
BEGIN
 PERFORM 1 FROM lzc_auth.sessions WHERE id=p_session FOR SHARE;
 PERFORM 1 FROM lzc.memberships WHERE tenant_id=lzc.current_tenant_id() AND user_id=lzc.current_user_id() FOR SHARE;
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM 1 FROM lzc.stackit_identities human WHERE human.user_id=lzc.current_user_id()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 IF job.id IS NULL OR NOT ((job.owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')))
  OR lzc.application_role('platform-engineer')) THEN
  RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501';
 END IF;
 -- The same instance lock serializes Plan, archive and review.
 PERFORM lzc_auth.require_active_application_order(p_session,job.instance_id);
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job FOR SHARE;
 SELECT * INTO bound FROM lzc.application_job_backends WHERE job_id=p_job FOR SHARE;
 PERFORM 1 FROM lzc.application_runner_tickets WHERE job_id=p_job FOR SHARE;
 PERFORM lzc_auth.assert_application_job_group(p_job);
 IF job.owner_user_id=lzc.current_user_id() AND dispatched.error_code='apply_failed'
  AND EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='output') THEN
  review_mode:='reported-failure';
  IF NOT EXISTS(SELECT 1 FROM lzc.application_instances i JOIN lzc.stackit_identities human ON human.user_id=i.requested_by
    AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
    AND human.email=i.resolved_settings->>'owner_email' WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id) THEN
   RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501';
  END IF;
 ELSE
  review_mode:='operator-attested';
  IF job.owner_user_id<>lzc.current_user_id() THEN
  context:=lzc_auth.application_recovery_review_context(p_session,p_job);
  IF NOT lzc.application_role('platform-engineer') OR NOT EXISTS(
   SELECT 1 FROM lzc.application_instances i
   JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id
   JOIN lzc.application_platform_contracts c ON c.revision=v.platform_revision AND c.tenant_id=v.tenant_id
   WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id AND c.approved_by=lzc.current_user_id()
  ) THEN RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM lzc.application_instances i JOIN lzc.stackit_identities h ON h.user_id=i.requested_by AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL AND h.valid_until>now() AND h.email=i.resolved_settings->>'owner_email' WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id) THEN RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 SELECT * INTO registered FROM lzc.state_backends b WHERE b.id=bound.backend_id AND b.tenant_id=job.tenant_id;
 IF job.operation IS DISTINCT FROM 'apply' OR dispatched.status IS DISTINCT FROM 'reconciliation_required'
  OR dispatched.finished_at IS NULL OR dispatched.runner_app_id IS NULL OR dispatched.error_code IS NOT DISTINCT FROM 'state_failed'
  OR grant_row.job_id IS NULL OR bound.job_id IS NULL OR registered.id IS NULL
  OR grant_row.binding_sha256 IS DISTINCT FROM job.binding_sha256
  OR bound.tenant_id IS DISTINCT FROM job.tenant_id OR bound.owner_user_id IS DISTINCT FROM job.owner_user_id
  OR bound.approved_by IS DISTINCT FROM grant_row.approved_by
  OR bound.descriptor->>'key' IS DISTINCT FROM grant_row.state_key
  OR grant_row.state_key IS DISTINCT FROM 'applications/'||job.tenant_id::text||'/'||job.instance_id::text||'/terraform.tfstate'
  OR bound.descriptor->>'useLockfile' IS DISTINCT FROM 'true'
  OR (review_mode='operator-attested' AND ((grant_row.revoked_at IS NULL AND grant_row.expires_at>now())
   OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job AND expires_at>now())))
  OR (review_mode='reported-failure' AND (NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket
    WHERE ticket.job_id=p_job AND ticket.tenant_id=job.tenant_id AND ticket.consumed_at IS NOT NULL AND ticket.runner_package_id=dispatched.runner_package_id)
   OR NOT EXISTS(SELECT 1 FROM lzc.application_runner_records output WHERE output.job_id=p_job AND output.kind='output'
    AND output.tenant_id=job.tenant_id AND output.owner_user_id=job.owner_user_id AND output.binding_sha256=job.binding_sha256
    AND output.state_key=grant_row.state_key AND output.runner_package_id=dispatched.runner_package_id)))
  OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery')
  OR EXISTS(SELECT 1 FROM lzc.application_dispatches other WHERE other.instance_id=job.instance_id AND other.tenant_id=job.tenant_id
   AND other.job_id<>p_job AND other.status NOT IN ('succeeded','failed','reconciliation_required'))
  OR (registered.descriptor - 'key' - 'useLockfile') IS DISTINCT FROM (bound.descriptor - 'key' - 'useLockfile')
  OR NOT EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=job.tenant_id AND t.organization_id=grant_row.organization_id AND t.organization_verified AND t.archived_at IS NULL)
 THEN RAISE EXCEPTION 'application_recovery_replan_unavailable' USING ERRCODE='40001'; END IF;
 descriptor_hash:=encode(sha256(convert_to(bound.descriptor::text,'UTF8')),'hex');
 -- Ciphertext is internal broker material; never serialize it into UI or proof tokens.
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'bindingSha256',job.binding_sha256,
  'status',dispatched.status,'operation',job.operation,'finishedAt',dispatched.finished_at,'recoverySha256',NULL,
  'finding','completion-review-required','mode',review_mode,
  'backendId',bound.backend_id,'backendDescriptor',bound.descriptor,'runnerAppId',dispatched.runner_app_id,
  'registeredBackendDescriptor',registered.descriptor,'backendCiphertext',encode(registered.credentials_ciphertext,'hex'),
  'stateKey',grant_row.state_key,'backendSha256',descriptor_hash,
  'existingReceipt',(SELECT to_jsonb(r) FROM lzc.application_recovery_replans r WHERE r.job_id=p_job));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.guided_application_recovery_base_context(uuid,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION lzc_auth.application_state_recovery_context(p_session uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.application_state_recoveries; c jsonb; j lzc.application_jobs; g lzc.application_job_grants; profile lzc.credential_profiles;
BEGIN
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND OR NOT ((r.owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer'))) OR (r.reviewed_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))) THEN
  RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 c:=lzc_auth.guided_application_recovery_base_context(p_session,r.job_id);
 IF c->>'mode'<>'operator-attested' OR c->'existingReceipt' IS DISTINCT FROM 'null'::jsonb
  OR EXISTS(SELECT 1 FROM lzc.application_jobs other JOIN lzc.application_jobs original ON original.id=r.job_id
   WHERE other.instance_id=original.instance_id AND other.created_at>original.created_at) THEN RAISE EXCEPTION 'application_state_recovery_unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO j FROM lzc.application_jobs WHERE id=r.job_id;
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=r.job_id;
 SELECT * INTO profile FROM lzc.credential_profiles WHERE id=g.credential_profile_id AND tenant_id=r.tenant_id AND owner_user_id=r.reviewed_by;
 IF r.owner_user_id=lzc.current_user_id() AND NOT EXISTS(SELECT 1 FROM lzc.application_job_delegations jd JOIN lzc.application_execution_delegations ed ON ed.id=jd.delegation_id AND ed.tenant_id=jd.tenant_id JOIN lzc.state_backends b ON b.id=ed.backend_id AND b.tenant_id=ed.tenant_id JOIN lzc.application_job_backends jb ON jb.job_id=jd.job_id AND jb.backend_id=b.id WHERE jd.job_id=j.id AND ed.revoked_at IS NULL AND ed.platform_revision=g.platform_revision AND ed.delegated_by=g.approved_by AND ed.credential_profile_id=g.credential_profile_id AND ed.credential_version=g.credential_version AND ed.credential_key_id=g.credential_key_id AND b.identity_sha256=ed.backend_identity AND md5(encode(b.credentials_ciphertext,'hex'))=ed.backend_credentials_hash) THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=r.tenant_id AND user_id=g.approved_by AND 'platform-engineer'=ANY(product_roles)) THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 IF profile.id IS NULL OR profile.state<>'stored' OR profile.key_id IS DISTINCT FROM g.credential_key_id
  OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=r.tenant_id AND user_id=j.owner_user_id AND
   ('application-owner'=ANY(product_roles) OR 'platform-engineer'=ANY(product_roles))) THEN
  RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 RETURN c || jsonb_build_object('recoveryId',r.id,'phase',r.phase,'originalInputs',j.inputs,
  'credentialOwnerId',profile.owner_user_id,'serviceAccount',profile.service_account,
  'credentialProfileId',g.credential_profile_id,'credentialVersion',g.credential_version,'credentialKeyId',g.credential_key_id,
  'organizationId',g.organization_id,'sourceRevision',g.accelerator_revision,'ownerUserId',j.owner_user_id,
  'runnerPackageId',(SELECT runner_package_id FROM lzc.application_dispatches WHERE job_id=r.job_id),
  'originalCreatedAt',j.created_at);
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_application_state_recovery_task(p_hash text,p_package uuid)
RETURNS TABLE(task_id uuid,recovery_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT t.id,t.recovery_id,s.id,s.user_id,t.tenant_id,least(t.expires_at,s.expires_at,h.valid_until)
 FROM lzc.application_state_recovery_tasks t JOIN lzc.application_state_recoveries r ON r.id=t.recovery_id
 JOIN lzc_auth.sessions s ON s.id=t.issuer_session_id AND s.user_id=t.issued_by
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=t.tenant_id
 JOIN lzc.tenants org ON org.id=t.tenant_id AND org.archived_at IS NULL AND org.organization_verified
 JOIN lzc.stackit_identities h ON h.user_id=s.user_id AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL
 WHERE t.ticket_hash=p_hash AND t.runner_package_id=p_package AND t.finished_at IS NULL
 AND t.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND h.valid_until>clock_timestamp()
 AND coalesce(s.active_tenant_id,s.tenant_id)=t.tenant_id AND (('platform-engineer'=ANY(m.product_roles) AND s.user_id=r.reviewed_by) OR (s.user_id=r.owner_user_id AND ('application-owner'=ANY(m.product_roles) OR 'platform-engineer'=ANY(m.product_roles))))
 AND ((t.mode='prepare' AND r.phase='assessing') OR (t.mode='commit' AND r.phase='committing'));
$$;

CREATE FUNCTION lzc_auth.record_guided_application_recovery_replan(p_session uuid,p_job uuid,p_binding text,p_backend_sha text,p_state_sha text,p_state_serial bigint,p_state_version text,p_attested boolean)
RETURNS lzc.application_recovery_replans LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; receipt lzc.application_recovery_replans;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM lzc.application_state_recoveries r JOIN lzc.application_state_recovery_tasks t ON t.recovery_id=r.id JOIN lzc.application_state_recovery_receipts receipt ON receipt.task_id=t.id AND receipt.phase='committed' WHERE r.job_id=p_job AND r.tenant_id=lzc.current_tenant_id() AND r.phase='committed' AND receipt.reviewed_by=lzc.current_user_id() AND receipt.review_session_id=p_session) THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 context:=lzc_auth.guided_application_recovery_base_context(p_session,p_job);
 IF p_attested IS DISTINCT FROM (context->>'mode'='operator-attested') OR p_state_sha IS NULL OR p_state_sha !~ '^[a-f0-9]{64}$'
  OR p_state_serial IS NULL OR p_state_serial<0 OR (p_state_version IS NOT NULL AND length(p_state_version) NOT BETWEEN 1 AND 1024)
 THEN RAISE EXCEPTION 'application_recovery_replan_unavailable' USING ERRCODE='40001'; END IF;
 IF context->>'bindingSha256' IS DISTINCT FROM p_binding OR context->>'backendSha256' IS DISTINCT FROM p_backend_sha THEN
  RAISE EXCEPTION 'application_recovery_replan_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 SELECT * INTO receipt FROM lzc.application_recovery_replans WHERE job_id=p_job;
 IF FOUND THEN
  IF receipt.reviewed_by<>lzc.current_user_id() OR receipt.mode IS DISTINCT FROM context->>'mode' OR receipt.binding_sha256 IS DISTINCT FROM p_binding
   OR receipt.backend_sha256 IS DISTINCT FROM p_backend_sha OR receipt.state_sha256 IS DISTINCT FROM p_state_sha
   OR receipt.state_serial IS DISTINCT FROM p_state_serial OR receipt.state_version IS DISTINCT FROM p_state_version THEN
   RAISE EXCEPTION 'application_recovery_replan_changed' USING ERRCODE='40001';
  END IF;
  RETURN receipt;
 END IF;
 INSERT INTO lzc.application_recovery_replans(job_id,tenant_id,owner_user_id,reviewed_by,review_session_id,mode,binding_sha256,backend_id,backend_sha256,state_key,state_sha256,state_serial,state_version,attested_runner_stopped,attested_cloud_state_compared)
 VALUES(p_job,job.tenant_id,job.owner_user_id,lzc.current_user_id(),p_session,context->>'mode',p_binding,(context->>'backendId')::uuid,p_backend_sha,context->>'stateKey',p_state_sha,p_state_serial,p_state_version,p_attested,p_attested)
 RETURNING * INTO receipt;
 RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION lzc_auth.record_guided_application_recovery_replan(uuid,uuid,text,text,text,bigint,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_guided_application_recovery_replan(uuid,uuid,text,text,text,bigint,text,boolean) TO configurator_app;
DROP POLICY application_state_recovery_task_read ON lzc.application_state_recovery_tasks;
CREATE POLICY application_state_recovery_task_read ON lzc.application_state_recovery_tasks FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_state_recoveries r WHERE r.id=lzc.application_state_recovery_tasks.recovery_id AND r.tenant_id=lzc.application_state_recovery_tasks.tenant_id AND ((r.owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer'))) OR (r.reviewed_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')))));
