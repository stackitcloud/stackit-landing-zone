CREATE OR REPLACE FUNCTION lzc_auth.complete_stackit_login(p_issuer text,p_subject text,p_email text,p_method text,p_session uuid,p_hash text,p_csrf text,p_expires timestamptz,p_proof_expires timestamptz,p_existing_session uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid,tenant_id uuid,github_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; workspace uuid; existing_account uuid; active_workspace uuid;
BEGIN
 IF p_issuer IS DISTINCT FROM 'https://accounts.stackit.cloud' OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 255
 OR p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 254 OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR p_email ~* '@sa\.stackit\.cloud$'
 OR p_method IS NULL OR p_method NOT IN ('signed-id-token-and-userinfo','device-grant-userinfo')
 OR p_expires IS NULL OR p_proof_expires IS NULL OR p_expires<=now() OR p_expires>now()+interval '8 hours' OR p_proof_expires<=now() OR p_proof_expires>now()+interval '24 hours' THEN
  RAISE EXCEPTION 'invalid_stackit_identity' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || ':' || p_subject,0));
 SELECT i.user_id INTO account FROM lzc_auth.external_identities i WHERE i.provider='oidc' AND i.issuer=p_issuer AND i.subject=p_subject;
 IF p_existing_session IS NOT NULL THEN
  SELECT s.user_id,coalesce(s.active_tenant_id,s.tenant_id) INTO STRICT existing_account,active_workspace FROM lzc_auth.sessions s JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=coalesce(s.active_tenant_id,s.tenant_id)
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
 INSERT INTO lzc_auth.sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at,active_tenant_id) VALUES(p_session,p_hash,account,workspace,p_csrf,p_expires,active_workspace);
 RETURN QUERY SELECT account,workspace,u.github_id::text FROM lzc_auth.users u WHERE u.id=account;
END $$;


-- Only authenticated server code can read the encrypted, session-bound renewal grant.
ALTER TABLE lzc_auth.sessions ADD COLUMN stackit_refresh_cipher bytea
 CHECK (stackit_refresh_cipher IS NULL OR octet_length(stackit_refresh_cipher) BETWEEN 28 AND 131072);
CREATE FUNCTION lzc_auth.lock_stackit_refresh(p_hash text)
RETURNS TABLE(session_id uuid,user_id uuid,token_tenant_id uuid,refresh_cipher bytea,expires_at timestamptz,
 issuer text,subject text,email text,proof_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id,s.user_id,s.tenant_id,s.stackit_refresh_cipher,s.expires_at,i.issuer,i.subject,i.email,i.valid_until
 FROM lzc_auth.resolve_session(p_hash) r JOIN lzc_auth.sessions s ON s.id=r.session_id
 JOIN lzc.stackit_identities i ON i.user_id=s.user_id AND i.revoked_at IS NULL
 FOR UPDATE OF s
$$;
CREATE FUNCTION lzc_auth.write_stackit_refresh(p_hash text,p_cipher bytea) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH updated AS (
 UPDATE lzc_auth.sessions s SET stackit_refresh_cipher=p_cipher
 WHERE s.id IN (SELECT session_id FROM lzc_auth.resolve_session(p_hash))
 RETURNING s.id) SELECT EXISTS(SELECT 1 FROM updated)
$$;
CREATE FUNCTION lzc_auth.complete_stackit_refresh(p_hash text,p_cipher bytea,p_issuer text,p_subject text,p_email text,p_proof_expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid;
BEGIN
 IF p_issuer IS DISTINCT FROM 'https://accounts.stackit.cloud' OR p_proof_expires IS NULL
 OR p_proof_expires<=now() OR p_proof_expires>now()+interval '24 hours' THEN
  RAISE EXCEPTION 'invalid_stackit_refresh' USING ERRCODE='23514';
 END IF;
 SELECT user_id INTO STRICT account FROM lzc_auth.resolve_session(p_hash);
 -- Renewal must never revive revocation, change identity or renew organization-owner proof.
 UPDATE lzc.stackit_identities SET valid_until=greatest(valid_until,p_proof_expires)
 WHERE user_id=account AND issuer=p_issuer AND subject=p_subject AND email=p_email AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_stackit_refresh_identity' USING ERRCODE='42501'; END IF;
 IF NOT lzc_auth.write_stackit_refresh(p_hash,p_cipher) THEN
  RAISE EXCEPTION 'invalid_stackit_refresh_session' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.lock_stackit_refresh(text),lzc_auth.write_stackit_refresh(text,bytea),lzc_auth.complete_stackit_refresh(text,bytea,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.lock_stackit_refresh(text),lzc_auth.write_stackit_refresh(text,bytea),lzc_auth.complete_stackit_refresh(text,bytea,text,text,text,timestamptz) TO configurator_app;
