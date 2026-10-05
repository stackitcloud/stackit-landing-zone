ALTER TABLE lzc_auth.users ADD COLUMN display_name text;
ALTER TABLE lzc_auth.login_requests ADD COLUMN linked_session_id uuid REFERENCES lzc_auth.sessions(id) ON DELETE CASCADE;

INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id)
 SELECT 'oidc',issuer,subject,user_id FROM lzc.stackit_identities;

CREATE FUNCTION lzc_auth.complete_stackit_login(p_issuer text,p_subject text,p_email text,p_method text,p_session uuid,p_hash text,p_csrf text,p_expires timestamptz,p_proof_expires timestamptz,p_existing_session uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid,tenant_id uuid,github_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; workspace uuid; existing_account uuid;
BEGIN
 IF p_issuer IS DISTINCT FROM 'https://accounts.stackit.cloud' OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 255
 OR p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 254 OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR p_email ~* '@sa\.stackit\.cloud$'
 OR p_method IS NULL OR p_method NOT IN ('signed-id-token-and-userinfo','device-grant-userinfo')
 OR p_expires IS NULL OR p_proof_expires IS NULL OR p_expires<=now() OR p_expires>now()+interval '8 hours' OR p_expires>p_proof_expires OR p_proof_expires>now()+interval '24 hours' THEN
  RAISE EXCEPTION 'invalid_stackit_identity' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || ':' || p_subject,0));
 SELECT i.user_id INTO account FROM lzc_auth.external_identities i WHERE i.provider='oidc' AND i.issuer=p_issuer AND i.subject=p_subject;
 IF p_existing_session IS NOT NULL THEN
  SELECT s.user_id INTO STRICT existing_account FROM lzc_auth.sessions s JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=coalesce(s.active_tenant_id,s.tenant_id)
  JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL
  WHERE s.id=p_existing_session AND s.expires_at>now() FOR UPDATE OF s;
  IF account IS NOT NULL AND account<>existing_account THEN RAISE EXCEPTION 'identity_already_bound' USING ERRCODE='23505'; END IF;
 END IF;
 IF account IS NULL THEN
  SELECT i.user_id INTO account FROM lzc.stackit_identities i WHERE i.issuer=p_issuer AND i.subject=p_subject;
  IF existing_account IS NOT NULL THEN
   IF account IS NOT NULL AND account<>existing_account THEN RAISE EXCEPTION 'identity_already_bound' USING ERRCODE='23505'; END IF;
   account:=existing_account;
  END IF;
  IF account IS NULL THEN
   INSERT INTO lzc_auth.users(display_name) VALUES(p_email) RETURNING id INTO account;
  END IF;
  INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('oidc',p_issuer,p_subject,account);
 END IF;
 UPDATE lzc_auth.users SET display_name=p_email WHERE id=account;
 INSERT INTO lzc.tenants(owner_user_id,name) VALUES(account,'Persönlicher Arbeitsbereich')
 ON CONFLICT(owner_user_id) DO UPDATE SET owner_user_id=excluded.owner_user_id RETURNING id INTO workspace;
 INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES(workspace,account,'admin') ON CONFLICT DO NOTHING;
 INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES(account,p_issuer,p_subject,p_email,p_method,p_proof_expires)
 ON CONFLICT ON CONSTRAINT stackit_identities_pkey DO UPDATE SET email=excluded.email,verification_method=excluded.verification_method,verified_at=now(),valid_until=excluded.valid_until,revoked_at=NULL
 WHERE stackit_identities.issuer=excluded.issuer AND stackit_identities.subject=excluded.subject;
 IF NOT FOUND THEN RAISE EXCEPTION 'identity_binding_conflict' USING ERRCODE='23505'; END IF;
 INSERT INTO lzc_auth.sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at) VALUES(p_session,p_hash,account,workspace,p_csrf,p_expires);
 RETURN QUERY SELECT account,workspace,u.github_id::text FROM lzc_auth.users u WHERE u.id=account;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.complete_stackit_login(text,text,text,text,uuid,text,text,timestamptz,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.complete_stackit_login(text,text,text,text,uuid,text,text,timestamptz,timestamptz,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.link_github(p_session uuid,p_tenant uuid,p_github bigint,p_login text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; linked uuid;
BEGIN
 SELECT s.user_id INTO STRICT account FROM lzc_auth.sessions s JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=coalesce(s.active_tenant_id,s.tenant_id)
 WHERE s.id=p_session AND s.expires_at>now() AND coalesce(s.active_tenant_id,s.tenant_id)=p_tenant FOR UPDATE OF s;
 IF p_github IS NULL OR p_github<=0 OR p_login IS NULL OR length(p_login) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_github_identity' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('github:' || p_github::text,0));
 SELECT i.user_id INTO linked FROM lzc_auth.external_identities i WHERE i.provider='github' AND i.issuer='https://github.com' AND i.subject=p_github::text;
 IF linked IS NOT NULL AND linked<>account THEN RAISE EXCEPTION 'github_identity_already_bound' USING ERRCODE='23505'; END IF;
 IF EXISTS(SELECT 1 FROM lzc_auth.users u WHERE u.id=account AND u.github_id IS NOT NULL AND u.github_id<>p_github) THEN RAISE EXCEPTION 'github_identity_binding_conflict' USING ERRCODE='23505'; END IF;
 INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('github','https://github.com',p_github::text,account) ON CONFLICT DO NOTHING;
 UPDATE lzc_auth.users SET github_id=p_github,github_login=p_login WHERE id=account;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.link_github(uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.link_github(uuid,uuid,bigint,text) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_session(p_hash text)
RETURNS TABLE(session_id uuid,user_id uuid,tenant_id uuid,github_id text,github_login text,csrf_token text,expires_at timestamptz,token_tenant_id uuid,tenant_kind text,product_roles text[],manage_members boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id,s.user_id,t.id,u.github_id::text,coalesce(u.display_name,u.github_login),s.csrf_token,s.expires_at,s.tenant_id,t.kind,m.product_roles,m.manage_members
 FROM lzc_auth.sessions s JOIN lzc_auth.users u ON u.id=s.user_id
 JOIN lzc.tenants t ON t.id=coalesce(s.active_tenant_id,s.tenant_id) AND t.archived_at IS NULL
 JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=s.user_id
 WHERE s.token_hash=p_hash AND s.expires_at>now()
$$;