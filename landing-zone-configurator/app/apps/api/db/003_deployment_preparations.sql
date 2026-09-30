ALTER TABLE lzc.credential_profiles ADD COLUMN last_check jsonb CHECK (last_check IS NULL OR jsonb_typeof(last_check) = 'object');
GRANT UPDATE(last_check) ON lzc.credential_profiles TO configurator_app;

-- Preparations are immutable metadata snapshots, not approved plans or executable runs.
CREATE TABLE lzc.deployment_preparations (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 credential_id uuid REFERENCES lzc.credential_profiles(id) ON DELETE SET NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
 manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deployment_preparations_owner ON lzc.deployment_preparations(tenant_id, owner_user_id);
ALTER TABLE lzc.deployment_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.deployment_preparations FORCE ROW LEVEL SECURITY;
CREATE POLICY own_preparation ON lzc.deployment_preparations TO configurator_app
 USING (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = deployment_preparations.tenant_id AND m.user_id = lzc.current_user_id()))
 WITH CHECK (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = deployment_preparations.tenant_id AND m.user_id = lzc.current_user_id() AND m.role IN ('admin','deployer')) AND EXISTS (SELECT 1 FROM lzc.credential_profiles c WHERE c.id = credential_id AND c.tenant_id = lzc.current_tenant_id() AND c.owner_user_id = lzc.current_user_id()));
CREATE POLICY migrate_preparation ON lzc.deployment_preparations TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON lzc.deployment_preparations TO configurator_app;
