-- Prove non-execution, rather than treating a missing worker report as Apply failure.
CREATE TABLE lzc.application_runner_start_failures (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_dispatches(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 instance_id uuid NOT NULL REFERENCES lzc.application_instances(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 review_session_id uuid NOT NULL,
 runner_app_id uuid NOT NULL,
 runner_package_id uuid NOT NULL,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 runner_observed_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE lzc.application_runner_start_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_runner_start_failures FORCE ROW LEVEL SECURITY;
CREATE POLICY application_runner_start_failure_read ON lzc.application_runner_start_failures FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND
  (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')));
CREATE POLICY application_runner_start_failure_migration ON lzc.application_runner_start_failures TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_runner_start_failures TO configurator_app;
CREATE TRIGGER immutable_application_runner_start_failure BEFORE UPDATE OR DELETE ON lzc.application_runner_start_failures
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.application_runner_start_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; dispatched lzc.application_dispatches; grant_row lzc.application_job_grants;
 ticket lzc.application_runner_tickets; receipt lzc.application_runner_start_failures;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_runner_start_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,job.instance_id);
 PERFORM lzc_auth.assert_application_job_group(p_job);
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO ticket FROM lzc.application_runner_tickets WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO receipt FROM lzc.application_runner_start_failures WHERE job_id=p_job;
 IF dispatched.job_id IS NULL OR dispatched.runner_app_id IS NULL OR dispatched.runner_package_id IS NULL
  OR dispatched.tenant_id IS DISTINCT FROM job.tenant_id OR dispatched.instance_id IS DISTINCT FROM job.instance_id
  OR dispatched.owner_user_id IS DISTINCT FROM job.owner_user_id
  OR grant_row.job_id IS NULL OR grant_row.binding_sha256 IS DISTINCT FROM job.binding_sha256
  OR grant_row.tenant_id IS DISTINCT FROM job.tenant_id OR grant_row.owner_user_id IS DISTINCT FROM job.owner_user_id
  OR grant_row.instance_id IS DISTINCT FROM job.instance_id OR ticket.tenant_id IS DISTINCT FROM job.tenant_id
  OR ticket.job_id IS NULL OR ticket.runner_package_id IS DISTINCT FROM dispatched.runner_package_id
  OR ticket.consumed_at IS NOT NULL
  OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job)
  OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job)
  OR NOT ((dispatched.status='starting' AND receipt.job_id IS NULL) OR
   (dispatched.status='failed' AND dispatched.error_code='runner_start_failed' AND receipt.job_id=p_job
    AND receipt.runner_app_id=dispatched.runner_app_id AND receipt.runner_package_id=dispatched.runner_package_id
    AND receipt.binding_sha256=job.binding_sha256 AND grant_row.revoked_at IS NOT NULL))
 THEN RAISE EXCEPTION 'application_runner_start_unavailable_or_claimed' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'runnerAppId',dispatched.runner_app_id,
  'runnerPackageId',dispatched.runner_package_id,'bindingSha256',job.binding_sha256,
  'existingReceipt',CASE WHEN receipt.job_id IS NULL THEN NULL ELSE jsonb_build_object(
   'jobId',job.id,'instanceId',job.instance_id,'status','failed','errorCode','runner_start_failed',
   'canReplan',true,'startsExecution',false) END);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_runner_start_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_runner_start_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.record_application_runner_start_failure(p_session uuid,p_job uuid,p_app uuid,p_package uuid,p_binding text,p_observed timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs;
BEGIN
 context:=lzc_auth.application_runner_start_context(p_session,p_job);
 IF context->>'runnerAppId' IS DISTINCT FROM p_app::text OR context->>'runnerPackageId' IS DISTINCT FROM p_package::text
  OR context->>'bindingSha256' IS DISTINCT FROM p_binding OR p_observed IS NULL
  OR p_observed<clock_timestamp()-interval '30 seconds' OR p_observed>clock_timestamp()+interval '5 seconds'
 THEN RAISE EXCEPTION 'application_runner_start_changed' USING ERRCODE='40001'; END IF;
 IF context->'existingReceipt'<>'null'::jsonb THEN RETURN context->'existingReceipt'; END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 INSERT INTO lzc.application_runner_start_failures(job_id,tenant_id,instance_id,owner_user_id,review_session_id,
  runner_app_id,runner_package_id,binding_sha256,runner_observed_at)
 VALUES(p_job,job.tenant_id,job.instance_id,job.owner_user_id,p_session,p_app,p_package,p_binding,p_observed);
 -- Revocation and terminal status are atomic with the unconsumed-ticket check.
 -- Never release a State lock, write State, or retry an infrastructure operation.
 UPDATE lzc.application_job_grants SET revoked_at=clock_timestamp() WHERE job_id=p_job AND revoked_at IS NULL;
 UPDATE lzc.application_dispatches SET status='failed',error_code='runner_start_failed',finished_at=clock_timestamp() WHERE job_id=p_job;
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'status','failed',
  'errorCode','runner_start_failed','canReplan',true,'startsExecution',false);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.record_application_runner_start_failure(uuid,uuid,uuid,uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_application_runner_start_failure(uuid,uuid,uuid,uuid,text,timestamptz) TO configurator_app;
