ALTER TABLE lzc.application_dispatches DROP CONSTRAINT application_dispatches_status_check;
ALTER TABLE lzc.application_dispatches DROP CONSTRAINT application_dispatches_check;
ALTER TABLE lzc.application_dispatches ADD CONSTRAINT application_dispatch_status CHECK(status IN ('reserved','starting','initializing','validating','planning','succeeded','failed','reconciliation_required'));
ALTER TABLE lzc.application_dispatches ADD CONSTRAINT application_dispatch_finished CHECK((status IN ('succeeded','failed','reconciliation_required'))=(finished_at IS NOT NULL));
ALTER TABLE lzc.application_dispatches ADD COLUMN summary jsonb;
ALTER TABLE lzc.application_dispatches ADD COLUMN error_code text;
DROP INDEX lzc.application_active_dispatch;
CREATE UNIQUE INDEX application_active_dispatch ON lzc.application_dispatches(tenant_id,instance_id) WHERE status NOT IN ('succeeded','failed');

CREATE OR REPLACE FUNCTION lzc_auth.reserve_application_dispatch(p_session uuid,p_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; approved lzc.application_job_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.accelerator_revision<>'c4b43c36af198985980b17626c48d357795e3fbd' OR NOT EXISTS(
  SELECT 1 FROM lzc.tenants t WHERE t.id=g.tenant_id AND t.organization_id=g.organization_id AND t.organization_verified AND t.archived_at IS NULL
 ) THEN RAISE EXCEPTION 'application_dispatch_grant_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_session_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,approved.backend_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('application-dispatch:' || g.tenant_id::text || ':' || g.instance_id::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE job_id=p_job) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_dispatch_grant_consumed' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=g.tenant_id AND instance_id=g.instance_id AND status NOT IN ('succeeded','failed')) THEN
  RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id)
 VALUES(g.job_id,g.tenant_id,g.instance_id,g.owner_user_id,g.approved_by,p_session);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.fail_application_dispatch(p_session uuid,p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 UPDATE lzc.application_dispatches SET status=CASE WHEN runner_app_id IS NULL THEN 'failed' ELSE 'reconciliation_required' END,finished_at=now()
 WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() AND approval_session_id=p_session AND status IN ('reserved','starting','initializing','validating','planning');
END $$;

CREATE OR REPLACE FUNCTION lzc.guard_application_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','runner_app_id','runner_package_id','finished_at','summary','error_code']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','runner_app_id','runner_package_id','finished_at','summary','error_code']) OR OLD.status IN ('succeeded','failed','reconciliation_required') THEN
  RAISE EXCEPTION 'immutable_application_dispatch' USING ERRCODE='55000';
 END IF;
 IF OLD.status='reserved' AND NEW.status='starting' AND OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.runner_app_id IS DISTINCT FROM OLD.runner_app_id OR NEW.runner_package_id IS DISTINCT FROM OLD.runner_package_id OR NOT (
  (OLD.status='starting' AND NEW.status='initializing') OR (OLD.status='initializing' AND NEW.status='validating') OR
  (OLD.status='validating' AND NEW.status='planning') OR (OLD.status='planning' AND NEW.status='succeeded') OR
  NEW.status IN ('failed','reconciliation_required')
 ) OR (NEW.status<>'succeeded' AND NEW.summary IS DISTINCT FROM OLD.summary) THEN
  RAISE EXCEPTION 'invalid_application_dispatch_transition' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE lzc.application_runner_records (
 job_id uuid NOT NULL REFERENCES lzc.application_dispatches(job_id),
 kind text NOT NULL CHECK(kind IN ('artifact','output')),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)>28 AND octet_length(ciphertext)<=16777244),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 summary jsonb,
 truncated boolean NOT NULL DEFAULT false,
 binding_sha256 text NOT NULL,
 state_key text NOT NULL,
 runner_package_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,kind),
 CHECK((kind='artifact')=(summary IS NOT NULL)),
 CHECK(kind<>'output' OR octet_length(ciphertext)<=2097180)
);
ALTER TABLE lzc.application_runner_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_runner_records FORCE ROW LEVEL SECURITY;
CREATE POLICY application_record_read ON lzc.application_runner_records FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')));
CREATE POLICY application_record_migration ON lzc.application_runner_records TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_runner_records TO configurator_app;
CREATE TRIGGER immutable_application_record BEFORE UPDATE OR DELETE ON lzc.application_runner_records FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.resolve_application_runner_report(p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,least(s.expires_at,ticket.expires_at)
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=ticket.tenant_id
 JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
 JOIN lzc.application_dispatches d ON d.job_id=ticket.job_id AND d.runner_package_id=ticket.runner_package_id
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
  AND ticket.expires_at>now() AND ticket.consumed_at IS NOT NULL AND s.expires_at>now()
  AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id AND 'platform-engineer'=ANY(m.product_roles)
  AND d.status IN ('starting','initializing','validating','planning');
$$;
REVOKE ALL ON FUNCTION lzc_auth.resolve_application_runner_report(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.resolve_application_runner_report(text,uuid,text,text) TO configurator_app;

CREATE FUNCTION lzc_auth.application_report_stage(p_session uuid,p_job uuid,p_stage text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 UPDATE lzc.application_dispatches d SET status=p_stage
 WHERE d.job_id=p_job AND d.tenant_id=lzc.current_tenant_id() AND d.approval_session_id=p_session
  AND EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=d.job_id AND ticket.consumed_at IS NOT NULL AND ticket.expires_at>now());
 IF NOT FOUND THEN RAISE EXCEPTION 'application_report_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_report_stage(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_report_stage(uuid,uuid,text) TO configurator_app;

CREATE FUNCTION lzc_auth.application_report_record(p_session uuid,p_job uuid,p_kind text,p_cipher bytea,p_sha text,p_summary jsonb,p_truncated boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; d lzc.application_dispatches; existing lzc.application_runner_records;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO d FROM lzc.application_dispatches WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approval_session_id=p_session FOR UPDATE;
 IF NOT FOUND OR (p_kind='artifact' AND d.status<>'planning') OR (p_kind='output' AND d.status NOT IN ('starting','initializing','validating','planning')) THEN
  RAISE EXCEPTION 'application_record_unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM lzc_auth.application_job_credential_context(p_session,p_job);
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job;
 SELECT * INTO existing FROM lzc.application_runner_records WHERE job_id=p_job AND kind=p_kind;
 IF FOUND THEN
  IF existing.sha256 IS DISTINCT FROM p_sha OR existing.summary IS DISTINCT FROM p_summary OR existing.truncated IS DISTINCT FROM p_truncated THEN
   RAISE EXCEPTION 'application_record_conflict' USING ERRCODE='40001';
  END IF;
  RETURN existing.sha256;
 END IF;
 INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,summary,truncated,binding_sha256,state_key,runner_package_id)
 VALUES(p_job,p_kind,g.tenant_id,g.owner_user_id,p_cipher,p_sha,p_summary,p_truncated,g.binding_sha256,g.state_key,d.runner_package_id);
 RETURN p_sha;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_report_record(uuid,uuid,text,bytea,text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_report_record(uuid,uuid,text,bytea,text,jsonb,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.application_report_result(p_session uuid,p_job uuid,p_status text,p_sha text,p_summary jsonb,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d lzc.application_dispatches; artifact lzc.application_runner_records;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO d FROM lzc.application_dispatches WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approval_session_id=p_session FOR UPDATE;
 IF NOT FOUND OR d.status NOT IN ('starting','initializing','validating','planning') OR NOT EXISTS(
  SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=p_job AND ticket.consumed_at IS NOT NULL AND ticket.expires_at>now()
 ) THEN RAISE EXCEPTION 'application_result_unavailable' USING ERRCODE='42501'; END IF;
 IF p_status='succeeded' THEN
  SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_job AND kind='artifact';
  IF NOT FOUND OR d.status<>'planning' OR artifact.sha256 IS DISTINCT FROM p_sha OR artifact.summary IS DISTINCT FROM p_summary OR artifact.runner_package_id IS DISTINCT FROM d.runner_package_id OR p_error IS NOT NULL THEN
   RAISE EXCEPTION 'application_artifact_mismatch' USING ERRCODE='42501';
  END IF;
 ELSIF p_status<>'failed' OR p_error IS NULL OR p_sha IS NOT NULL OR p_summary IS NOT NULL THEN
  RAISE EXCEPTION 'application_result_invalid' USING ERRCODE='42501';
 END IF;
 UPDATE lzc.application_dispatches SET status=p_status,summary=p_summary,error_code=p_error,finished_at=now() WHERE job_id=p_job;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_report_result(uuid,uuid,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_report_result(uuid,uuid,text,text,jsonb,text) TO configurator_app;