-- A retry is a fresh Plan of the same order, pinned to the failed Apply's State.
-- It never reuses the old saved Plan or grants a new Apply implicitly.
CREATE TABLE lzc.application_apply_retries (
 plan_job_id uuid PRIMARY KEY REFERENCES lzc.application_jobs(id),
 source_apply_id uuid NOT NULL REFERENCES lzc.application_jobs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 backend_id uuid NOT NULL REFERENCES lzc.state_backends(id),
 backend_descriptor jsonb NOT NULL,
 state_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(plan_job_id<>source_apply_id)
);
ALTER TABLE lzc.application_apply_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_apply_retries FORCE ROW LEVEL SECURITY;
CREATE POLICY application_apply_retry_read ON lzc.application_apply_retries FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (owner_user_id=lzc.current_user_id() OR lzc.application_role('platform-engineer')));
CREATE POLICY application_apply_retry_migration ON lzc.application_apply_retries TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_apply_retries TO configurator_app;
CREATE TRIGGER immutable_application_apply_retry BEFORE UPDATE OR DELETE ON lzc.application_apply_retries
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.bind_application_apply_retry(p_session uuid,p_apply uuid,p_plan uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source lzc.application_jobs; planned lzc.application_jobs; dispatched lzc.application_dispatches;
 old_grant lzc.application_job_grants; bound lzc.application_job_backends; previous lzc.application_apply_retries;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM 1 FROM lzc.stackit_identities human WHERE human.user_id=lzc.current_user_id()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_apply_retry_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM lzc.application_jobs WHERE id=p_apply AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id();
 IF source.id IS NULL THEN RAISE EXCEPTION 'application_apply_retry_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,source.instance_id);
 SELECT * INTO source FROM lzc.application_jobs WHERE id=p_apply FOR UPDATE;
 SELECT * INTO planned FROM lzc.application_jobs WHERE id=p_plan AND tenant_id=source.tenant_id AND owner_user_id=source.owner_user_id FOR UPDATE;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_apply FOR UPDATE;
 SELECT * INTO old_grant FROM lzc.application_job_grants WHERE job_id=p_apply FOR UPDATE;
 SELECT * INTO bound FROM lzc.application_job_backends WHERE job_id=p_apply FOR SHARE;
 PERFORM 1 FROM lzc.application_runner_tickets WHERE job_id=p_apply FOR UPDATE;
 PERFORM 1 FROM lzc.application_job_claims WHERE job_id=p_apply FOR SHARE;
 IF source.operation IS DISTINCT FROM 'apply' OR coalesce(source.inputs->>'purpose','standard')<>'standard'
  OR planned.id IS NULL OR planned.operation IS DISTINCT FROM 'plan' OR planned.instance_id<>source.instance_id
  OR coalesce(planned.inputs->>'purpose','standard')<>'standard' OR planned.issuer_session_id<>p_session
  OR dispatched.finished_at IS NULL OR planned.created_at<=dispatched.finished_at
  OR old_grant.job_id IS NULL OR bound.job_id IS NULL OR bound.tenant_id<>source.tenant_id OR bound.owner_user_id<>source.owner_user_id
  OR bound.descriptor->>'key' IS DISTINCT FROM old_grant.state_key
  OR old_grant.state_key IS DISTINCT FROM 'applications/'||source.tenant_id::text||'/'||source.instance_id::text||'/terraform.tfstate'
  OR dispatched.error_code IS NOT DISTINCT FROM 'state_failed'
  OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_apply AND kind='recovery')
  OR EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=source.instance_id AND newer.tenant_id=source.tenant_id
    AND newer.operation='apply' AND (newer.created_at,newer.id)>(source.created_at,source.id))
  OR lzc_auth.application_execution_blocked(p_plan,source.instance_id,source.tenant_id,'standard')
 THEN RAISE EXCEPTION 'application_apply_retry_unavailable' USING ERRCODE='40001'; END IF;
 -- A reported/unknown execution needs the existing reviewed State checkpoint.
 -- A failure before any input capability was claimed cannot have run OpenTofu.
 IF NOT ((dispatched.status='reconciliation_required' AND lzc_auth.application_recovery_replan_valid(p_apply))
  OR (dispatched.status='failed' AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_apply)
   AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_apply AND consumed_at IS NOT NULL))) THEN
  RAISE EXCEPTION 'application_apply_retry_checkpoint_required' USING ERRCODE='40001';
 END IF;
 PERFORM lzc_auth.assert_application_replan_fresh(p_plan);
 SELECT * INTO previous FROM lzc.application_apply_retries WHERE plan_job_id=p_plan;
 IF FOUND THEN
  IF previous.source_apply_id<>p_apply OR previous.backend_id<>bound.backend_id OR previous.backend_descriptor IS DISTINCT FROM bound.descriptor THEN
   RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='40001'; END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_job_backends existing WHERE existing.job_id=p_plan
  AND (existing.backend_id<>bound.backend_id OR existing.descriptor IS DISTINCT FROM bound.descriptor)) THEN
  RAISE EXCEPTION 'application_apply_retry_state_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO lzc.application_apply_retries(plan_job_id,source_apply_id,tenant_id,owner_user_id,backend_id,backend_descriptor,state_key)
 VALUES(p_plan,p_apply,source.tenant_id,source.owner_user_id,bound.backend_id,bound.descriptor,old_grant.state_key);
 -- Preserve consumed grants as immutable evidence. The shared execution gate
 -- below explicitly denies all further release for a superseded Apply.
 IF NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_apply)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_apply AND consumed_at IS NOT NULL) THEN
  UPDATE lzc.application_job_grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE job_id=p_apply;
 END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.bind_application_apply_retry(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.bind_application_apply_retry(uuid,uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc.guard_application_apply_retry_backend() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retry lzc.application_apply_retries; planned uuid;
BEGIN
 SELECT coalesce(j.plan_id,j.id) INTO planned FROM lzc.application_jobs j WHERE j.id=NEW.job_id;
 SELECT * INTO retry FROM lzc.application_apply_retries WHERE plan_job_id=planned;
 IF FOUND AND (NEW.tenant_id<>retry.tenant_id OR NEW.owner_user_id<>retry.owner_user_id OR NEW.backend_id<>retry.backend_id
  OR NEW.descriptor IS DISTINCT FROM retry.backend_descriptor OR NEW.descriptor->>'key' IS DISTINCT FROM retry.state_key) THEN
  RAISE EXCEPTION 'application_apply_retry_state_changed' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_apply_retry_backend() FROM PUBLIC;
CREATE TRIGGER application_apply_retry_backend BEFORE INSERT OR UPDATE ON lzc.application_job_backends
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_apply_retry_backend();


-- Add a superseded-Apply denial while preserving the complete existing guard.
DO $$ DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.assert_application_execution_binding(uuid)'::regprocedure);
 IF strpos(definition,E'BEGIN\n')=0 OR strpos(definition,'application_execution_binding_changed')=0 THEN
  RAISE EXCEPTION 'application_retry_execution_guard_missing'; END IF;
 EXECUTE replace(definition,E'BEGIN\n',$guard$BEGIN
 IF EXISTS(SELECT 1 FROM lzc.application_apply_retries retry WHERE retry.source_apply_id=p_job AND retry.tenant_id=lzc.current_tenant_id()) THEN
  RAISE EXCEPTION 'application_apply_superseded' USING ERRCODE='42501';
 END IF;
$guard$);
END $$;
