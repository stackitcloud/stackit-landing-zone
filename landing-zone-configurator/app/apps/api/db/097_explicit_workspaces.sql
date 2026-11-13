-- Login contexts are not workspaces. Keep their stable IDs for encrypted grants,
-- but expose only explicitly selected, ordinary workspaces to the product.
ALTER TABLE lzc.tenants DROP CONSTRAINT tenants_kind_check;
ALTER TABLE lzc.tenants DROP CONSTRAINT tenant_kind;
ALTER TABLE lzc.tenants ALTER COLUMN kind SET DEFAULT 'account';

-- Preserve any old workspace that actually owns data, including encrypted
-- credentials and resource/state identities. Never invent a verified cloud org.
DO $$
DECLARE home record; dependency record; used boolean; occupied boolean;
BEGIN
 FOR home IN SELECT id,owner_user_id,name FROM lzc.tenants WHERE kind='personal' LOOP
  used:=false;
  FOR dependency IN
   SELECT ns.nspname AS schema_name, cl.relname AS table_name, at.attname AS column_name
   FROM pg_catalog.pg_constraint fk
   JOIN pg_catalog.pg_class cl ON cl.oid=fk.conrelid
   JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
   JOIN pg_catalog.pg_attribute at ON at.attrelid=cl.oid AND at.attnum=fk.conkey[1]
   WHERE fk.contype='f' AND fk.confrelid='lzc.tenants'::regclass
     AND ns.nspname='lzc' AND cl.relname NOT IN ('memberships','application_groups') AND cardinality(fk.conkey)=1
  LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',dependency.schema_name,dependency.table_name,dependency.column_name) INTO occupied USING home.id;
   used:=used OR occupied;
  END LOOP;
  used:=used OR EXISTS(SELECT 1 FROM lzc.application_groups WHERE tenant_id=home.id AND (NOT is_default OR name<>'Application Owners'))
    OR EXISTS(SELECT 1 FROM lzc.application_group_members WHERE tenant_id=home.id AND user_id<>home.owner_user_id);
  IF used THEN
   UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,
    name=CASE WHEN name='Persönlicher Arbeitsbereich' OR name=(SELECT u.github_login || ' · Persönlicher Arbeitsbereich' FROM lzc_auth.users u WHERE u.id=home.owner_user_id) THEN 'Workspace' ELSE name END
   WHERE id=home.id;
   UPDATE lzc.memberships SET
    product_roles=CASE WHEN role='admin' THEN ARRAY['platform-engineer','application-owner']::text[] WHEN role IN ('editor','deployer') THEN ARRAY['platform-engineer']::text[] ELSE product_roles END,
    manage_members=(role='admin')
   WHERE tenant_id=home.id;
   INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action)
    VALUES(home.id,home.owner_user_id,home.owner_user_id,'organisation_created');
  ELSE
   DELETE FROM lzc.application_group_members WHERE tenant_id=home.id;
   DELETE FROM lzc.application_groups WHERE tenant_id=home.id;
   UPDATE lzc.tenants SET kind='account',name='account' WHERE id=home.id;
   UPDATE lzc.memberships SET role='viewer',product_roles='{}',manage_members=false WHERE tenant_id=home.id;
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION lzc.create_default_application_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.kind='organisation' THEN
  INSERT INTO lzc.application_groups(tenant_id,name,is_default) VALUES(NEW.id,'Application Owners',true);
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE lzc.tenants ADD CONSTRAINT tenants_kind_check CHECK (kind IN ('account','organisation'));
ALTER TABLE lzc.tenants ADD CONSTRAINT tenant_kind CHECK (
 (kind='account' AND owner_user_id IS NOT NULL AND organization_id IS NULL AND NOT organization_verified)
 OR (kind='organisation' AND owner_user_id IS NULL AND (organization_id IS NOT NULL OR NOT organization_verified)));

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
 INSERT INTO lzc.tenants(owner_user_id, name) VALUES(u, 'account')
 ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = excluded.owner_user_id RETURNING id INTO t;
 INSERT INTO lzc.memberships(tenant_id, user_id, role) VALUES(t, u, 'viewer') ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.sessions(id, token_hash, user_id, tenant_id, csrf_token, expires_at)
 VALUES(p_session_id, p_token_hash, u, t, p_csrf, p_expires);
 RETURN QUERY SELECT u, t;
END $$;

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
 INSERT INTO lzc.tenants(owner_user_id,name) VALUES(account,'account')
 ON CONFLICT(owner_user_id) DO UPDATE SET owner_user_id=excluded.owner_user_id RETURNING id INTO workspace;
 INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES(workspace,account,'viewer') ON CONFLICT DO NOTHING;
 INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES(account,p_issuer,p_subject,p_email,p_method,p_proof_expires)
 ON CONFLICT ON CONSTRAINT stackit_identities_pkey DO UPDATE SET email=excluded.email,verification_method=excluded.verification_method,verified_at=now(),valid_until=excluded.valid_until,revoked_at=NULL
 WHERE stackit_identities.issuer=excluded.issuer AND stackit_identities.subject=excluded.subject;
 IF NOT FOUND THEN RAISE EXCEPTION 'identity_binding_conflict' USING ERRCODE='23505'; END IF;
 INSERT INTO lzc_auth.sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at,active_tenant_id) VALUES(p_session,p_hash,account,workspace,p_csrf,p_expires,active_workspace);
 RETURN QUERY SELECT account,workspace,u.github_id::text FROM lzc_auth.users u WHERE u.id=account;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_session(p_hash text)
RETURNS TABLE(session_id uuid,user_id uuid,tenant_id uuid,github_id text,github_login text,csrf_token text,expires_at timestamptz,token_tenant_id uuid,tenant_kind text,product_roles text[],manage_members boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id,s.user_id,coalesce(t.id,s.tenant_id),u.github_id::text,coalesce(u.display_name,u.github_login),s.csrf_token,s.expires_at,s.tenant_id,
 CASE WHEN t.id IS NULL THEN 'account' ELSE 'organisation' END,
 CASE WHEN t.id IS NULL THEN '{}'::text[] ELSE m.product_roles END,
 CASE WHEN t.id IS NULL THEN false ELSE m.manage_members END
 FROM lzc_auth.sessions s JOIN lzc_auth.users u ON u.id=s.user_id
 LEFT JOIN lzc.tenants t ON t.id=s.active_tenant_id AND t.kind='organisation' AND t.archived_at IS NULL
 LEFT JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=s.user_id
 WHERE s.token_hash=p_hash AND s.expires_at>now() AND (t.id IS NULL OR m.user_id IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION lzc_auth.organisation_overview(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; result jsonb; active uuid;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 SELECT t.id INTO active FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id
 WHERE t.id=s.active_tenant_id AND t.kind='organisation' AND t.archived_at IS NULL AND m.user_id=s.user_id;
 SELECT jsonb_build_object('userId',s.user_id,'activeTenantId',active,'tenants',coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'organizationId',t.organization_id,'organizationVerified',t.organization_verified,'roles',m.product_roles,'manageMembers',m.manage_members,'canArchive',t.kind='organisation' AND NOT t.organization_verified AND m.manage_members AND EXISTS(SELECT 1 FROM lzc_auth.membership_audit a WHERE a.tenant_id=t.id AND a.action='organisation_created' AND a.actor_id=s.user_id)) ORDER BY t.created_at),'[]'::jsonb)) INTO result
 FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id WHERE m.user_id=s.user_id AND t.kind='organisation' AND t.archived_at IS NULL;
 RETURN result || jsonb_build_object('members',CASE WHEN EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=active AND user_id=s.user_id AND manage_members) THEN
 (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'login',u.github_login,'displayName',coalesce(nullif(u.display_name,''),u.github_login),'email',(SELECT h.email FROM lzc.stackit_identities h WHERE h.user_id=m.user_id AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL),'roles',m.product_roles,'manageMembers',m.manage_members) ORDER BY u.created_at),'[]'::jsonb) FROM lzc.memberships m JOIN lzc_auth.users u ON u.id=m.user_id WHERE m.tenant_id=active) ELSE '[]'::jsonb END);
END $$;


CREATE OR REPLACE FUNCTION lzc_auth.switch_organisation(p_session uuid,p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 SELECT user_id INTO STRICT u FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 -- Serializes with membership removal. Token tenant is deliberately immutable.
 PERFORM 1 FROM lzc.tenants WHERE id=p_tenant AND kind='organisation' AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=u) THEN RAISE EXCEPTION 'membership_required' USING ERRCODE='42501'; END IF;
 UPDATE lzc_auth.sessions SET active_tenant_id=p_tenant WHERE id=p_session;
END $$;

-- Retained legacy data may not contain an organization ID. Assigning one is
-- only a draft edit; the ordinary external Owner-proof step is still required.
CREATE OR REPLACE FUNCTION lzc_auth.assign_workspace_organization(p_session uuid,p_tenant uuid,p_organization uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 SELECT s.user_id INTO STRICT actor FROM lzc_auth.sessions s
 WHERE s.id=p_session AND s.expires_at>now() AND s.active_tenant_id=p_tenant;
 PERFORM 1 FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id
 WHERE t.id=p_tenant AND t.kind='organisation' AND t.archived_at IS NULL
  AND m.user_id=actor AND m.manage_members AND 'platform-engineer'=ANY(m.product_roles)
 FOR UPDATE OF t;
 IF NOT FOUND THEN RAISE EXCEPTION 'membership_management_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE lzc.tenants SET organization_id=p_organization WHERE id=p_tenant AND organization_id IS NULL AND NOT organization_verified;
 IF NOT FOUND OR p_organization IS NULL THEN RAISE EXCEPTION 'organization_already_assigned' USING ERRCODE='23514'; END IF;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action) VALUES(p_tenant,actor,'organization_assigned');
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assign_workspace_organization(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.assign_workspace_organization(uuid,uuid,uuid) TO configurator_app;

