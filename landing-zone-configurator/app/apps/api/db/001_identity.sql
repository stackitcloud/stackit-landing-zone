-- Executed only by configurator_migration. Runtime is neither owner nor BYPASSRLS.
CREATE SCHEMA lzc_auth;
CREATE SCHEMA lzc;
REVOKE ALL ON SCHEMA lzc_auth, lzc FROM PUBLIC;
GRANT USAGE ON SCHEMA lzc_auth, lzc TO configurator_app;

CREATE TABLE lzc_auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id bigint NOT NULL UNIQUE CHECK (github_id > 0),
  github_login text NOT NULL CHECK (length(github_login) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lzc.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES lzc_auth.users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lzc.memberships (
  tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
  user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
  role text NOT NULL CHECK (role IN ('viewer', 'editor', 'deployer', 'admin')),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE lzc.configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
  created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX configurations_tenant ON lzc.configurations(tenant_id);

CREATE TABLE lzc_auth.login_requests (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[A-Za-z0-9_-]{43}$'),
  verifier text NOT NULL CHECK (verifier ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_expiry ON lzc_auth.login_requests(expires_at);
CREATE TABLE lzc_auth.sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
  tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
  csrf_token text NOT NULL CHECK (csrf_token ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_expiry ON lzc_auth.sessions(expires_at);

-- Identity context is set transaction-locally only after resolving an opaque session.
CREATE FUNCTION lzc.current_user_id() RETURNS uuid LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$
 SELECT nullif(current_setting('lzc.user_id', true), '')::uuid
$$;
CREATE FUNCTION lzc.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$
 SELECT nullif(current_setting('lzc.tenant_id', true), '')::uuid
$$;
ALTER TABLE lzc.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.configurations FORCE ROW LEVEL SECURITY;
CREATE POLICY own_membership ON lzc.memberships FOR SELECT TO configurator_app
 USING (user_id = lzc.current_user_id());
CREATE POLICY tenant_member ON lzc.tenants FOR SELECT TO configurator_app
 USING (id = lzc.current_tenant_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = id AND m.user_id = lzc.current_user_id()));
CREATE POLICY configuration_read ON lzc.configurations FOR SELECT TO configurator_app
 USING (tenant_id = lzc.current_tenant_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = configurations.tenant_id AND m.user_id = lzc.current_user_id()));
CREATE POLICY configuration_insert ON lzc.configurations FOR INSERT TO configurator_app
 WITH CHECK (tenant_id = lzc.current_tenant_id() AND created_by = lzc.current_user_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = configurations.tenant_id AND m.user_id = lzc.current_user_id() AND m.role IN ('editor', 'admin')));
CREATE POLICY configuration_update ON lzc.configurations FOR UPDATE TO configurator_app
 USING (tenant_id = lzc.current_tenant_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = configurations.tenant_id AND m.user_id = lzc.current_user_id() AND m.role IN ('editor', 'admin')))
 WITH CHECK (tenant_id = lzc.current_tenant_id() AND EXISTS (
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id = configurations.tenant_id AND m.user_id = lzc.current_user_id() AND m.role IN ('editor', 'admin')));
-- Explicit policies for the migration owner, including the narrowly exposed login function.
CREATE POLICY provision_tenant ON lzc.tenants TO configurator_migration USING (true) WITH CHECK (true);
CREATE POLICY provision_membership ON lzc.memberships TO configurator_migration USING (true) WITH CHECK (true);
CREATE POLICY migrate_configuration ON lzc.configurations TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT ON lzc.tenants, lzc.memberships TO configurator_app;
GRANT SELECT, INSERT ON lzc.configurations TO configurator_app;
GRANT UPDATE(name, document, revision, updated_at) ON lzc.configurations TO configurator_app;

-- Login is a trusted server operation, never an endpoint accepting a GitHub ID from a browser.
CREATE FUNCTION lzc_auth.complete_login(p_github_id bigint, p_login text, p_session_id uuid,
 p_token_hash text, p_csrf text, p_expires timestamptz)
RETURNS TABLE(user_id uuid, tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid; t uuid;
BEGIN
 IF p_expires <= now() OR p_expires > now() + interval '8 hours' THEN
  RAISE EXCEPTION 'invalid session expiry';
 END IF;
 INSERT INTO lzc_auth.users(github_id, github_login) VALUES(p_github_id, p_login)
 ON CONFLICT (github_id) DO UPDATE SET github_login = excluded.github_login RETURNING id INTO u;
 INSERT INTO lzc.tenants(owner_user_id, name) VALUES(u, p_login || ' · Persönlicher Arbeitsbereich')
 ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = excluded.owner_user_id RETURNING id INTO t;
 INSERT INTO lzc.memberships(tenant_id, user_id, role) VALUES(t, u, 'admin') ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.sessions(id, token_hash, user_id, tenant_id, csrf_token, expires_at)
 VALUES(p_session_id, p_token_hash, u, t, p_csrf, p_expires);
 RETURN QUERY SELECT u, t;
END $$;
CREATE FUNCTION lzc_auth.resolve_session(p_hash text)
RETURNS TABLE(session_id uuid, user_id uuid, tenant_id uuid, github_id text, github_login text, csrf_token text, expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT s.id, s.user_id, s.tenant_id, u.github_id::text, u.github_login, s.csrf_token, s.expires_at
 FROM lzc_auth.sessions s JOIN lzc_auth.users u ON u.id = s.user_id
 JOIN lzc.memberships m ON m.tenant_id = s.tenant_id AND m.user_id = s.user_id
 WHERE s.token_hash = p_hash AND s.expires_at > now()
$$;
CREATE FUNCTION lzc_auth.delete_session(p_hash text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 DELETE FROM lzc_auth.sessions WHERE token_hash = p_hash RETURNING id
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lzc_auth, lzc FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA lzc_auth, lzc TO configurator_app;
GRANT SELECT, INSERT, DELETE ON lzc_auth.login_requests TO configurator_app;
-- No direct runtime grants on users or sessions, and no grants to edit memberships.
