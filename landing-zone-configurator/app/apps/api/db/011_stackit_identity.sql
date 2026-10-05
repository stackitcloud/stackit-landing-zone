CREATE TABLE lzc.stackit_identities (
  user_id uuid PRIMARY KEY REFERENCES lzc_auth.users(id),
  issuer text NOT NULL CHECK (issuer = 'https://accounts.stackit.cloud'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email !~* '@sa\.stackit\.cloud$'),
  verification_method text NOT NULL CHECK (verification_method IN ('signed-id-token-and-userinfo', 'device-grant-userinfo')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (issuer, subject)
);

CREATE TABLE lzc.stackit_organization_access (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES lzc.stackit_identities(user_id),
  organization_id uuid NOT NULL,
  organization_name text NOT NULL CHECK (length(organization_name) BETWEEN 1 AND 256),
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES lzc.memberships(tenant_id, user_id) ON DELETE CASCADE
);

ALTER TABLE lzc.stackit_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.stackit_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.stackit_organization_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.stackit_organization_access FORCE ROW LEVEL SECURITY;

CREATE POLICY stackit_identity_owner ON lzc.stackit_identities TO configurator_app
 USING (user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m WHERE m.user_id = lzc.current_user_id() AND m.tenant_id = lzc.current_tenant_id()))
 WITH CHECK (user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m WHERE m.user_id = lzc.current_user_id() AND m.tenant_id = lzc.current_tenant_id()));
CREATE POLICY stackit_organization_owner ON lzc.stackit_organization_access TO configurator_app
 USING (user_id = lzc.current_user_id() AND tenant_id = lzc.current_tenant_id() AND EXISTS (
  SELECT 1 FROM lzc.tenants t WHERE t.id = stackit_organization_access.tenant_id AND t.organization_id = stackit_organization_access.organization_id AND t.archived_at IS NULL))
 WITH CHECK (user_id = lzc.current_user_id() AND tenant_id = lzc.current_tenant_id() AND EXISTS (
  SELECT 1 FROM lzc.tenants t WHERE t.id = stackit_organization_access.tenant_id AND t.organization_id = stackit_organization_access.organization_id AND t.archived_at IS NULL));
CREATE POLICY migrate_stackit_identity ON lzc.stackit_identities TO configurator_migration USING (true) WITH CHECK (true);
CREATE POLICY migrate_stackit_organization ON lzc.stackit_organization_access TO configurator_migration USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON lzc.stackit_identities TO configurator_app;
GRANT UPDATE(email, verification_method, verified_at, valid_until, revoked_at) ON lzc.stackit_identities TO configurator_app;
GRANT SELECT, INSERT, DELETE ON lzc.stackit_organization_access TO configurator_app;
GRANT UPDATE(organization_id, organization_name, verified_at, valid_until) ON lzc.stackit_organization_access TO configurator_app;