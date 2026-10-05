CREATE TABLE lzc.application_platform_contracts (
 revision uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 organization_id uuid NOT NULL,
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL CHECK(credential_version>0),
 credential_key_id text NOT NULL,
 credential_checked_at timestamptz NOT NULL,
 document jsonb NOT NULL CHECK (jsonb_typeof(document)='object'),
 UNIQUE(tenant_id,revision),
 CHECK ((document->>'tenant_id'=tenant_id::text AND document->>'revision'=revision::text AND document->>'organization_id'=organization_id::text) IS TRUE)
);
ALTER TABLE lzc.application_platform_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_platform_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY application_contract_read ON lzc.application_platform_contracts FOR SELECT TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_contract_insert ON lzc.application_platform_contracts FOR INSERT TO configurator_app
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer') AND EXISTS (
  SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.organization_id=application_platform_contracts.organization_id AND t.archived_at IS NULL
 ));
CREATE POLICY application_contract_migration ON lzc.application_platform_contracts TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT,INSERT ON lzc.application_platform_contracts TO configurator_app;
CREATE TRIGGER immutable_application_contract BEFORE UPDATE OR DELETE ON lzc.application_platform_contracts
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

ALTER TABLE lzc.application_template_versions
 ADD COLUMN platform_revision uuid,
 ADD COLUMN target_key text,
 ADD CONSTRAINT application_template_contract FOREIGN KEY(tenant_id,platform_revision) REFERENCES lzc.application_platform_contracts(tenant_id,revision),
 ADD CONSTRAINT application_template_target CHECK ((platform_revision IS NULL AND target_key IS NULL) OR (platform_revision IS NOT NULL AND target_key IS NOT NULL AND target_key ~ '^[a-z][a-z0-9-]{0,47}$'));

CREATE OR REPLACE FUNCTION lzc.protect_application_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (
  EXISTS(SELECT 1 FROM lzc.application_template_versions WHERE tenant_id=NEW.id) OR
  EXISTS(SELECT 1 FROM lzc.application_instances WHERE tenant_id=NEW.id) OR
  EXISTS(SELECT 1 FROM lzc.application_platform_contracts WHERE tenant_id=NEW.id)
 ) THEN RAISE EXCEPTION 'organisation_not_empty_draft' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;