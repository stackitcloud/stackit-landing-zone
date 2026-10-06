CREATE TABLE lzc.application_platform_sources (
 revision uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 apply_run_id uuid NOT NULL REFERENCES lzc.plan_runs(id),
 state_key text NOT NULL REFERENCES lzc.platform_states(state_key),
 state_version bigint NOT NULL CHECK(state_version>0),
 source_contract_revision uuid NOT NULL,
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
 approval_session_id uuid NOT NULL,
 credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL CHECK(credential_version>0),
 credential_key_id text NOT NULL,
 FOREIGN KEY(tenant_id,revision) REFERENCES lzc.application_platform_contracts(tenant_id,revision),
 UNIQUE(tenant_id,apply_run_id,document_sha256,credential_profile_id,credential_version,credential_key_id)
);
ALTER TABLE lzc.application_platform_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_platform_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY application_platform_source_read ON lzc.application_platform_sources FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_platform_source_insert ON lzc.application_platform_sources FOR INSERT TO configurator_app
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY application_platform_source_migration ON lzc.application_platform_sources TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.application_platform_sources TO configurator_app;

CREATE FUNCTION lzc.guard_application_platform_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE contract lzc.application_platform_contracts; prepared jsonb;
BEGIN
 PERFORM lzc_auth.authorize_application(NEW.approval_session_id,lzc.current_tenant_id(),'publish');
 SELECT * INTO STRICT contract FROM lzc.application_platform_contracts WHERE revision=NEW.revision;
 IF contract.tenant_id IS DISTINCT FROM NEW.tenant_id OR contract.approved_by IS DISTINCT FROM lzc.current_user_id()
  OR contract.credential_profile_id IS DISTINCT FROM NEW.credential_profile_id
  OR contract.credential_version IS DISTINCT FROM NEW.credential_version
  OR contract.credential_key_id IS DISTINCT FROM NEW.credential_key_id THEN
  RAISE EXCEPTION 'application_platform_source_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM lzc.plan_runs run JOIN lzc.platform_states state ON state.state_key=run.state_key
 WHERE run.id=NEW.apply_run_id AND run.tenant_id=NEW.tenant_id AND run.owner_user_id=lzc.current_user_id()
  AND run.operation='apply' AND run.status='succeeded' AND run.applied_state_version=NEW.state_version
  AND state.tenant_id=run.tenant_id AND state.owner_user_id=run.owner_user_id AND state.version=NEW.state_version
  AND state.state_key=NEW.state_key AND state.lock_run_id IS NULL
 FOR SHARE OF run,state;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_platform_source_changed' USING ERRCODE='40001'; END IF;
 SELECT preparation.manifest INTO STRICT prepared FROM lzc.deployment_preparations preparation
 JOIN lzc.plan_runs run ON run.preparation_id=preparation.id WHERE run.id=NEW.apply_run_id;
 IF prepared->'organization'->>'id' IS DISTINCT FROM contract.organization_id::text THEN
  RAISE EXCEPTION 'application_platform_source_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM lzc.stackit_organization_access access
 JOIN lzc.stackit_identities identity ON identity.user_id=access.user_id
 JOIN lzc.tenants tenant ON tenant.id=access.tenant_id
 WHERE access.tenant_id=NEW.tenant_id AND access.user_id=lzc.current_user_id()
  AND tenant.organization_verified AND tenant.archived_at IS NULL
  AND tenant.organization_id=contract.organization_id AND access.organization_id=contract.organization_id
  AND access.valid_until>now() AND identity.valid_until>now() AND identity.revoked_at IS NULL
  AND access.verified_at>=identity.verified_at
 FOR SHARE OF access,identity,tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_platform_source_invalid' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER application_platform_source BEFORE INSERT ON lzc.application_platform_sources FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_source();
CREATE TRIGGER immutable_application_platform_source BEFORE UPDATE OR DELETE ON lzc.application_platform_sources FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
REVOKE ALL ON FUNCTION lzc.guard_application_platform_source() FROM PUBLIC;