-- Runner-loss evidence only. State, locks and execution clearance stay untouched.
CREATE TABLE lzc.application_apply_interruptions (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_dispatches(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 review_session_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 runner_observed_at timestamptz NOT NULL,
 runner_app_id uuid NOT NULL,
 runner_package_id uuid NOT NULL,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 backend_sha256 text NOT NULL CHECK(backend_sha256 ~ '^[a-f0-9]{64}$')
);
ALTER TABLE lzc.application_apply_interruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_apply_interruptions FORCE ROW LEVEL SECURITY;
CREATE POLICY application_apply_interruption_read ON lzc.application_apply_interruptions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND
  (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')));
CREATE POLICY application_apply_interruption_migration ON lzc.application_apply_interruptions TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_apply_interruptions TO configurator_app;
CREATE TRIGGER immutable_application_apply_interruption BEFORE UPDATE OR DELETE ON lzc.application_apply_interruptions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.interrupted_application_apply_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; dispatched lzc.application_dispatches; grant_row lzc.application_job_grants;
 bound lzc.application_job_backends; registered lzc.state_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id()
  AND owner_user_id=lzc.current_user_id() AND operation='apply' AND coalesce(inputs->>'purpose','standard')='standard';
 IF NOT FOUND THEN RAISE EXCEPTION 'application_apply_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,job.instance_id);
 PERFORM lzc_auth.assert_application_job_group(p_job);
 PERFORM 1 FROM lzc.stackit_identities human JOIN lzc.application_instances i ON i.requested_by=human.user_id
  WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id AND human.user_id=job.owner_user_id
   AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
   AND human.email=i.resolved_settings->>'owner_email' FOR SHARE OF human;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_apply_recovery_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job FOR SHARE;
 SELECT * INTO bound FROM lzc.application_job_backends WHERE job_id=p_job FOR SHARE;
 SELECT * INTO registered FROM lzc.state_backends WHERE id=bound.backend_id AND tenant_id=job.tenant_id FOR SHARE;
 IF dispatched.job_id IS NULL OR dispatched.runner_app_id IS NULL OR dispatched.runner_package_id IS NULL
  OR NOT (dispatched.status IN ('initializing','validating','applying') OR
   (dispatched.status='reconciliation_required' AND dispatched.error_code='cancelled'
    AND EXISTS(SELECT 1 FROM lzc.application_apply_interruptions WHERE job_id=p_job)))
  OR grant_row.job_id IS NULL OR bound.job_id IS NULL OR registered.id IS NULL
  OR grant_row.binding_sha256 IS DISTINCT FROM job.binding_sha256
  OR bound.tenant_id IS DISTINCT FROM job.tenant_id OR bound.owner_user_id IS DISTINCT FROM job.owner_user_id
  OR bound.approved_by IS DISTINCT FROM grant_row.approved_by
  OR bound.descriptor->>'key' IS DISTINCT FROM grant_row.state_key
  OR grant_row.state_key IS DISTINCT FROM 'applications/'||job.tenant_id::text||'/'||job.instance_id::text||'/terraform.tfstate'
  OR bound.descriptor->>'useLockfile' IS DISTINCT FROM 'true'
  OR (registered.descriptor - 'key' - 'useLockfile') IS DISTINCT FROM (bound.descriptor - 'key' - 'useLockfile')
  OR NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=p_job AND t.tenant_id=job.tenant_id
   AND t.consumed_at IS NOT NULL AND t.runner_package_id=dispatched.runner_package_id)
  OR NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job AND tenant_id=job.tenant_id)
  OR job.plan_id IS NULL OR job.artifact_sha256 IS NULL
  OR NOT EXISTS(SELECT 1 FROM lzc.application_runner_records r WHERE r.job_id=job.plan_id AND r.kind='artifact'
   AND r.tenant_id=job.tenant_id AND r.owner_user_id=job.owner_user_id AND r.sha256=job.artifact_sha256)
  OR NOT EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=job.tenant_id AND t.organization_verified
   AND t.archived_at IS NULL AND t.organization_id=grant_row.organization_id)
 THEN RAISE EXCEPTION 'application_apply_recovery_unavailable' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'runnerAppId',dispatched.runner_app_id,
  'runnerPackageId',dispatched.runner_package_id,'bindingSha256',job.binding_sha256,'backendId',bound.backend_id,
  'backendSha256',encode(sha256(convert_to(bound.descriptor::text,'UTF8')),'hex'),'backendDescriptor',bound.descriptor,
  'existingReceipt',(SELECT jsonb_build_object('jobId',job_id,'instanceId',job.instance_id,'status','reconciliation_required',
   'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'runnerStop','verified-stopped','stateCheck','not-performed','stateLock','not-checked',
   'requiresOperatorReview',true,'canReplan',false,'startsExecution',false) FROM lzc.application_apply_interruptions WHERE job_id=p_job));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.interrupted_application_apply_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.interrupted_application_apply_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.record_interrupted_application_apply(p_session uuid,p_job uuid,p_binding text,p_backend text,p_observed timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; receipt lzc.application_apply_interruptions; job lzc.application_jobs;
BEGIN
 context:=lzc_auth.interrupted_application_apply_context(p_session,p_job);
 IF context->'existingReceipt'<>'null'::jsonb THEN RETURN context->'existingReceipt'; END IF;
 IF context->>'bindingSha256' IS DISTINCT FROM p_binding OR context->>'backendSha256' IS DISTINCT FROM p_backend
  OR p_observed IS NULL OR p_observed<clock_timestamp()-interval '30 seconds' OR p_observed>clock_timestamp()+interval '5 seconds'
 THEN RAISE EXCEPTION 'application_apply_recovery_changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 INSERT INTO lzc.application_apply_interruptions(job_id,tenant_id,owner_user_id,review_session_id,runner_observed_at,
  runner_app_id,runner_package_id,binding_sha256,backend_sha256)
 VALUES(p_job,job.tenant_id,job.owner_user_id,p_session,p_observed,(context->>'runnerAppId')::uuid,
  (context->>'runnerPackageId')::uuid,p_binding,p_backend) RETURNING * INTO receipt;
 -- Never forge apply_failed: that would incorrectly enable owner-only replan
 -- clearance for a worker-reported, completed failure. This completion is unknown.
 UPDATE lzc.application_dispatches SET status='reconciliation_required',finished_at=clock_timestamp(),error_code='cancelled' WHERE job_id=p_job;
 RETURN jsonb_build_object('jobId',p_job,'instanceId',job.instance_id,'status','reconciliation_required',
  'recordedAt',to_char(receipt.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'runnerStop','verified-stopped','stateCheck','not-performed','stateLock','not-checked',
  'requiresOperatorReview',true,'canReplan',false,'startsExecution',false);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.record_interrupted_application_apply(uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_interrupted_application_apply(uuid,uuid,text,text,timestamptz) TO configurator_app;
