CREATE TABLE lzc.application_job_backends (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_job_grants(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 approval_session_id uuid NOT NULL,
 backend_id uuid NOT NULL REFERENCES lzc.state_backends(id),
 descriptor jsonb NOT NULL CHECK(jsonb_typeof(descriptor)='object'),
 approved_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>approved_at)
);
ALTER TABLE lzc.application_job_backends ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_backends FORCE ROW LEVEL SECURITY;
CREATE POLICY application_backend_read ON lzc.application_job_backends FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner'))) OR (approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_backend_migration ON lzc.application_job_backends TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_job_backends TO configurator_app;
CREATE TRIGGER immutable_application_job_backend BEFORE UPDATE OR DELETE ON lzc.application_job_backends FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.approve_application_job_backend(p_session uuid,p_job uuid,p_backend uuid)
RETURNS lzc.application_job_backends LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; j lzc.application_jobs; approved lzc.application_job_backends; descriptor jsonb; approval_expiry timestamptz;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at<=now() THEN
  RAISE EXCEPTION 'application_job_grant_unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO j FROM lzc.application_jobs WHERE id=p_job AND tenant_id=g.tenant_id AND owner_user_id=g.owner_user_id;
 IF NOT FOUND OR j.status<>'prepared' OR NOT EXISTS(
  SELECT 1 FROM lzc_auth.sessions s JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=g.tenant_id
  JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
  WHERE s.id=j.issuer_session_id AND s.user_id=g.owner_user_id AND s.expires_at>now()
   AND coalesce(s.active_tenant_id,s.tenant_id)=g.tenant_id
   AND ('platform-engineer'=ANY(m.product_roles) OR 'application-owner'=ANY(m.product_roles))
 ) OR NOT EXISTS(
  SELECT 1 FROM lzc.stackit_identities human WHERE human.user_id=g.approved_by AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
 ) OR NOT EXISTS(
  SELECT 1 FROM lzc.stackit_identities human JOIN lzc.application_instances i ON i.requested_by=human.user_id AND i.id=g.instance_id AND i.tenant_id=g.tenant_id
  WHERE human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() AND human.email=i.resolved_settings->>'owner_email'
 ) THEN RAISE EXCEPTION 'application_job_authority_unavailable' USING ERRCODE='42501'; END IF;
 SELECT b.descriptor INTO descriptor FROM lzc.state_backends b WHERE b.id=p_backend AND b.tenant_id=g.tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_backend_not_found' USING ERRCODE='42501'; END IF;
 SELECT least(g.expires_at,s.expires_at,human.valid_until) INTO approval_expiry
 FROM lzc_auth.sessions s JOIN lzc.stackit_identities human ON human.user_id=s.user_id
 WHERE s.id=p_session AND s.user_id=g.approved_by AND s.expires_at>now()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_backend_approver_expired' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job;
 IF FOUND THEN
  IF approved.expires_at<=now() OR NOT EXISTS(
   SELECT 1 FROM lzc_auth.sessions s WHERE s.id=approved.approval_session_id AND s.user_id=g.approved_by AND s.expires_at>now() AND coalesce(s.active_tenant_id,s.tenant_id)=g.tenant_id
  ) THEN RAISE EXCEPTION 'application_backend_approval_expired' USING ERRCODE='42501'; END IF;
  IF approved.backend_id IS DISTINCT FROM p_backend THEN RAISE EXCEPTION 'application_backend_binding_conflict' USING ERRCODE='40001'; END IF;
  RETURN approved;
 END IF;
 INSERT INTO lzc.application_job_backends(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,backend_id,descriptor,expires_at)
 VALUES(g.job_id,g.tenant_id,g.owner_user_id,g.approved_by,p_session,p_backend,descriptor || jsonb_build_object('key',g.state_key,'useLockfile',true),approval_expiry)
 RETURNING * INTO approved;
 RETURN approved;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.approve_application_job_backend(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.approve_application_job_backend(uuid,uuid,uuid) TO configurator_app;