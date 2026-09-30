-- Only non-secret metadata. Key material lives exclusively in Secrets Manager.
CREATE TABLE lzc.credential_profiles (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
 service_account text NOT NULL CHECK (length(service_account) <= 254),
 key_id text NOT NULL CHECK (length(key_id) BETWEEN 1 AND 128),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'stored')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credential_profiles_owner ON lzc.credential_profiles(tenant_id, owner_user_id);
ALTER TABLE lzc.credential_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.credential_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY own_credential ON lzc.credential_profiles TO configurator_app
 USING (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = credential_profiles.tenant_id AND m.user_id = lzc.current_user_id()))
 WITH CHECK (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = credential_profiles.tenant_id AND m.user_id = lzc.current_user_id() AND m.role IN ('deployer', 'admin')));
CREATE POLICY migrate_credential ON lzc.credential_profiles TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON lzc.credential_profiles TO configurator_app;
GRANT UPDATE(state) ON lzc.credential_profiles TO configurator_app;
