CREATE TABLE lzc.application_jobs (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 instance_id uuid NOT NULL REFERENCES lzc.application_instances(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer_session_id uuid NOT NULL,
 idempotency_key uuid NOT NULL,
 operation text NOT NULL CHECK(operation='plan'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status='prepared'),
 inputs jsonb NOT NULL CHECK(jsonb_typeof(inputs)='object' AND octet_length(inputs::text)<=1048576),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 UNIQUE(tenant_id,owner_user_id,idempotency_key)
);

CREATE TABLE lzc.application_job_grants (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_jobs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 instance_id uuid NOT NULL REFERENCES lzc.application_instances(id),
 version_id uuid NOT NULL REFERENCES lzc.application_template_versions(id),
 platform_revision uuid NOT NULL REFERENCES lzc.application_platform_contracts(revision),
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 organization_id uuid NOT NULL,
 credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL CHECK(credential_version>0),
 credential_key_id text NOT NULL,
 accelerator_revision text NOT NULL CHECK(accelerator_revision='4d15d7870afa323badd93559d8b37c5a8d138dcf'),
 state_key text NOT NULL,
 operation text NOT NULL CHECK(operation='plan'),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(state_key='applications/' || tenant_id::text || '/' || instance_id::text || '/terraform.tfstate')
);

ALTER TABLE lzc.application_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY application_job_owner ON lzc.application_jobs TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')))
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_job_migration ON lzc.application_jobs TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_grant_access ON lzc.application_job_grants TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner'))) OR (approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_grant_migration ON lzc.application_job_grants TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.application_jobs TO configurator_app;
GRANT SELECT ON lzc.application_job_grants TO configurator_app;
GRANT UPDATE(revoked_at) ON lzc.application_job_grants TO configurator_app;

CREATE FUNCTION lzc.issue_application_job_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; i lzc.application_instances; v lzc.application_template_versions;
 c lzc.application_platform_contracts; human lzc.stackit_identities;
BEGIN
 PERFORM lzc_auth.authorize_application(NEW.issuer_session_id,NEW.tenant_id,'order');
 SELECT * INTO s FROM lzc_auth.sessions WHERE id=NEW.issuer_session_id;
 SELECT * INTO i FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id AND requested_by=NEW.owner_user_id;
 IF NOT FOUND OR s.user_id IS DISTINCT FROM NEW.owner_user_id THEN
  RAISE EXCEPTION 'application_job_owner_mismatch' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v FROM lzc.application_template_versions WHERE id=i.version_id AND tenant_id=i.tenant_id;
 SELECT * INTO c FROM lzc.application_platform_contracts WHERE revision=v.platform_revision AND tenant_id=i.tenant_id;
 IF NOT FOUND OR v.accelerator_revision<>'4d15d7870afa323badd93559d8b37c5a8d138dcf' OR
  i.deployment_policy IS DISTINCT FROM v.deployment_policy OR NOT EXISTS(
   SELECT 1 FROM lzc.tenants t WHERE t.id=i.tenant_id AND t.organization_id=c.organization_id AND t.organization_verified AND t.archived_at IS NULL
  ) OR NOT EXISTS(
   SELECT 1 FROM lzc.memberships m WHERE m.tenant_id=i.tenant_id AND m.user_id=c.approved_by AND 'platform-engineer'=ANY(m.product_roles)
  ) THEN RAISE EXCEPTION 'application_job_contract_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO human FROM lzc.stackit_identities WHERE user_id=i.requested_by AND issuer='https://accounts.stackit.cloud' AND revoked_at IS NULL AND valid_until>now();
 IF NOT FOUND OR i.resolved_settings->>'owner_email' IS DISTINCT FROM human.email OR
  NEW.expires_at>least(s.expires_at,human.valid_until,now()+interval '25 minutes') THEN
  RAISE EXCEPTION 'application_job_identity_unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO lzc.application_job_grants(job_id,tenant_id,owner_user_id,instance_id,version_id,platform_revision,approved_by,organization_id,credential_profile_id,credential_version,credential_key_id,accelerator_revision,state_key,operation,binding_sha256,expires_at)
 VALUES(NEW.id,i.tenant_id,i.requested_by,i.id,i.version_id,c.revision,c.approved_by,c.organization_id,c.credential_profile_id,c.credential_version,c.credential_key_id,v.accelerator_revision,'applications/' || i.tenant_id::text || '/' || i.id::text || '/terraform.tfstate',NEW.operation,NEW.binding_sha256,NEW.expires_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.issue_application_job_grant() FROM PUBLIC;
CREATE TRIGGER issue_application_job_grant AFTER INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.issue_application_job_grant();
CREATE TRIGGER immutable_application_job BEFORE UPDATE OR DELETE ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc.guard_application_job_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR
  (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
  RAISE EXCEPTION 'immutable_application_job_grant' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_job_grant() FROM PUBLIC;
CREATE TRIGGER immutable_application_job_grant BEFORE UPDATE OR DELETE ON lzc.application_job_grants FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_job_grant();