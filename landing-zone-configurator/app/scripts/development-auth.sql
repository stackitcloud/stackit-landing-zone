CREATE TABLE IF NOT EXISTS lzc_auth.development_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES lzc_auth.users(id),
  enabled boolean NOT NULL DEFAULT true
);
REVOKE ALL ON lzc_auth.development_accounts FROM PUBLIC, configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.provision_development_account(p_account uuid, p_login text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account uuid; workspace uuid;
BEGIN
  SELECT user_id INTO account FROM lzc_auth.development_accounts WHERE id=p_account;
  IF account IS NULL THEN
    INSERT INTO lzc_auth.users(display_name) VALUES(p_login || ' (Entwicklung)') RETURNING id INTO account;
    INSERT INTO lzc_auth.development_accounts(id,user_id) VALUES(p_account,account);
  END IF;
  INSERT INTO lzc.tenants(owner_user_id,name) VALUES(account,'Ubuntu-Entwicklung')
  ON CONFLICT(owner_user_id) DO UPDATE SET owner_user_id=excluded.owner_user_id RETURNING id INTO workspace;
  INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES(workspace,account,'admin') ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.provision_development_account(uuid,text) FROM PUBLIC, configurator_app, configurator_development;

CREATE OR REPLACE FUNCTION lzc_auth.complete_development_login(p_account uuid,p_session uuid,p_hash text,p_csrf text,p_expires timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account uuid; workspace uuid;
BEGIN
  IF p_expires IS NULL OR p_expires<=now() OR p_expires>now()+interval '8 hours' THEN
    RAISE EXCEPTION 'invalid_development_session_expiry' USING ERRCODE='23514';
  END IF;
  SELECT a.user_id,t.id INTO STRICT account,workspace
  FROM lzc_auth.development_accounts a
  JOIN lzc.tenants t ON t.owner_user_id=a.user_id AND t.kind='personal' AND t.archived_at IS NULL
  JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=a.user_id AND m.role='admin'
  WHERE a.id=p_account AND a.enabled;
  INSERT INTO lzc_auth.sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at)
  VALUES(p_session,p_hash,account,workspace,p_csrf,p_expires);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.complete_development_login(uuid,uuid,text,text,timestamptz) FROM PUBLIC, configurator_app;
GRANT EXECUTE ON FUNCTION lzc_auth.complete_development_login(uuid,uuid,text,text,timestamptz) TO configurator_development;
