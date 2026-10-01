-- Internal user UUIDs stay stable. Legacy GitHub columns remain during rollout.
-- No browser-accessible account linking or OIDC trust configuration is introduced here.
ALTER TABLE lzc_auth.users ALTER COLUMN github_id DROP NOT NULL;
ALTER TABLE lzc_auth.users ALTER COLUMN github_login DROP NOT NULL;
CREATE TABLE lzc_auth.external_identities (
 provider text NOT NULL CHECK (provider IN ('github', 'oidc')),
 issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
 subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
 user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (provider, issuer, subject),
 CHECK (provider <> 'github' OR (issuer = 'https://github.com' AND subject ~ '^[1-9][0-9]*$'))
);
CREATE INDEX external_identity_user ON lzc_auth.external_identities(user_id);
REVOKE ALL ON lzc_auth.external_identities FROM PUBLIC, configurator_app;
INSERT INTO lzc_auth.external_identities(provider, issuer, subject, user_id)
 SELECT 'github', 'https://github.com', github_id::text, id FROM lzc_auth.users;

CREATE OR REPLACE FUNCTION lzc_auth.complete_login(p_github_id bigint, p_login text, p_session_id uuid,
 p_token_hash text, p_csrf text, p_expires timestamptz)
RETURNS TABLE(user_id uuid, tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid; t uuid;
BEGIN
 IF p_expires <= now() OR p_expires > now() + interval '8 hours' THEN
  RAISE EXCEPTION 'invalid session expiry';
 END IF;
 -- Serialize first logins for the same external subject, including concurrent callbacks.
 PERFORM pg_advisory_xact_lock(hashtextextended('github:' || p_github_id::text, 0));
 SELECT i.user_id INTO u FROM lzc_auth.external_identities i
 WHERE i.provider = 'github' AND i.issuer = 'https://github.com' AND i.subject = p_github_id::text;
 IF u IS NULL THEN
  INSERT INTO lzc_auth.users(github_id, github_login) VALUES(p_github_id, p_login) RETURNING id INTO u;
  INSERT INTO lzc_auth.external_identities(provider, issuer, subject, user_id)
  VALUES('github', 'https://github.com', p_github_id::text, u);
 ELSE
  UPDATE lzc_auth.users SET github_login = p_login WHERE id = u;
 END IF;
 INSERT INTO lzc.tenants(owner_user_id, name) VALUES(u, p_login || ' · Persönlicher Arbeitsbereich')
 ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = excluded.owner_user_id RETURNING id INTO t;
 INSERT INTO lzc.memberships(tenant_id, user_id, role) VALUES(t, u, 'admin') ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.sessions(id, token_hash, user_id, tenant_id, csrf_token, expires_at)
 VALUES(p_session_id, p_token_hash, u, t, p_csrf, p_expires);
 RETURN QUERY SELECT u, t;
END $$;
