CREATE TABLE lzc.application_job_claims (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_job_backends(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 approval_session_id uuid NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>claimed_at)
);

ALTER TABLE lzc.application_job_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY application_claim_access ON lzc.application_job_claims TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner'))) OR (approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_claim_migration ON lzc.application_job_claims TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_job_claims TO configurator_app;
CREATE TRIGGER immutable_application_claim BEFORE UPDATE OR DELETE ON lzc.application_job_claims FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.claim_application_job_grant(p_session uuid,p_job uuid)
RETURNS lzc.application_job_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; b lzc.application_job_backends; claimed lzc.application_job_claims;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_grant_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_backend_approval_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,b.backend_id);
 IF EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_grant_consumed' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_job_claims(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,expires_at)
 VALUES(g.job_id,g.tenant_id,g.owner_user_id,g.approved_by,b.approval_session_id,b.expires_at)
 RETURNING * INTO claimed;
 RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.claim_application_job_grant(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.claim_application_job_grant(uuid,uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc.guard_application_job_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR
  (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
  RAISE EXCEPTION 'immutable_application_job_grant' USING ERRCODE='55000';
 END IF;
 IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=OLD.job_id) THEN
  RAISE EXCEPTION 'application_grant_consumed' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;