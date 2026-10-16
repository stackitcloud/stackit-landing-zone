ALTER TABLE lzc.tenants ADD COLUMN archived_at timestamptz;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_session(p_hash text)
RETURNS TABLE(session_id uuid,user_id uuid,tenant_id uuid,github_id text,github_login text,csrf_token text,expires_at timestamptz,token_tenant_id uuid,tenant_kind text,product_roles text[],manage_members boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id,s.user_id,t.id,u.github_id::text,u.github_login,s.csrf_token,s.expires_at,s.tenant_id,t.kind,m.product_roles,m.manage_members
 FROM lzc_auth.sessions s JOIN lzc_auth.users u ON u.id=s.user_id
 JOIN lzc.tenants t ON t.id=coalesce(s.active_tenant_id,s.tenant_id) AND t.archived_at IS NULL
 JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=s.user_id
 WHERE s.token_hash=p_hash AND s.expires_at>now()
$$;

CREATE OR REPLACE FUNCTION lzc_auth.organisation_overview(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; result jsonb; active uuid;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 active:=coalesce(s.active_tenant_id,s.tenant_id);
 IF NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=active AND user_id=s.user_id) THEN RAISE EXCEPTION 'membership_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('userId',s.user_id,'activeTenantId',active,'tenants',coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'organizationId',t.organization_id,'organizationVerified',t.organization_verified,'roles',m.product_roles,'manageMembers',m.manage_members,'canArchive',t.kind='organisation' AND NOT t.organization_verified AND m.manage_members AND EXISTS(SELECT 1 FROM lzc_auth.membership_audit a WHERE a.tenant_id=t.id AND a.action='organisation_created' AND a.actor_id=s.user_id)) ORDER BY t.created_at),'[]'::jsonb)) INTO result
 FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id WHERE m.user_id=s.user_id AND t.archived_at IS NULL;
 RETURN result || jsonb_build_object('members',CASE WHEN EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=active AND user_id=s.user_id AND manage_members) THEN
 (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'login',u.github_login,'roles',m.product_roles,'manageMembers',m.manage_members) ORDER BY u.created_at),'[]'::jsonb) FROM lzc.memberships m JOIN lzc_auth.users u ON u.id=m.user_id WHERE m.tenant_id=active) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.switch_organisation(p_session uuid,p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 SELECT user_id INTO STRICT u FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 -- Serializes with membership removal. Token tenant is deliberately immutable.
 PERFORM 1 FROM lzc.tenants WHERE id=p_tenant AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=u) THEN RAISE EXCEPTION 'membership_required' USING ERRCODE='42501'; END IF;
 UPDATE lzc_auth.sessions SET active_tenant_id=p_tenant WHERE id=p_session;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.edit_organisation_member(p_session uuid,p_user uuid,p_roles text[],p_manage boolean,p_remove boolean,p_expected_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; t uuid;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 t:=coalesce(s.active_tenant_id,s.tenant_id);
 IF t<>p_expected_tenant THEN RAISE EXCEPTION 'stale_tenant_context' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM lzc.tenants WHERE id=t AND kind='organisation' AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=t AND user_id=s.user_id AND manage_members) THEN RAISE EXCEPTION 'membership_management_forbidden' USING ERRCODE='42501'; END IF;
 IF (p_remove OR NOT p_manage) AND EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=t AND user_id=p_user AND manage_members) AND NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=t AND user_id<>p_user AND manage_members) THEN RAISE EXCEPTION 'last_manager_required' USING ERRCODE='23514'; END IF;
 IF NOT p_remove AND p_user=s.user_id AND NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=t AND user_id=p_user AND p_roles <@ product_roles) THEN RAISE EXCEPTION 'self_escalation_forbidden' USING ERRCODE='42501'; END IF;
 IF p_remove THEN
 DELETE FROM lzc.memberships WHERE tenant_id=t AND user_id=p_user;
 -- Immediately revoke the active tenant; retain the user's personal login and token binding.
 UPDATE lzc_auth.sessions SET active_tenant_id=NULL WHERE user_id=p_user AND active_tenant_id=t;
 ELSE
 IF cardinality(p_roles)<1 OR NOT (p_roles <@ ARRAY['platform-engineer','application-owner']::text[]) OR (p_manage AND NOT 'platform-engineer'=ANY(p_roles)) THEN RAISE EXCEPTION 'invalid_membership' USING ERRCODE='23514'; END IF;
 INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles,manage_members) VALUES(t,p_user,'viewer',p_roles,p_manage)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET product_roles=excluded.product_roles,manage_members=excluded.manage_members;
 END IF;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action,details) VALUES(t,s.user_id,p_user,CASE WHEN p_remove THEN 'member_removed' ELSE 'member_updated' END,jsonb_build_object('roles',p_roles,'manageMembers',p_manage));
END $$;

CREATE FUNCTION lzc_auth.archive_organisation(p_session uuid,p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; t lzc.tenants;
BEGIN
 SELECT user_id INTO STRICT u FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 SELECT * INTO t FROM lzc.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND OR t.kind<>'organisation' OR t.archived_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=u AND manage_members) OR NOT EXISTS(SELECT 1 FROM lzc_auth.membership_audit WHERE tenant_id=p_tenant AND action='organisation_created' AND actor_id=u) THEN
 RAISE EXCEPTION 'organisation_archive_forbidden' USING ERRCODE='42501'; END IF;
 IF t.organization_verified OR EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id<>u) OR EXISTS(SELECT 1 FROM lzc.configurations WHERE tenant_id=p_tenant) OR EXISTS(SELECT 1 FROM lzc.credential_profiles WHERE tenant_id=p_tenant) OR EXISTS(SELECT 1 FROM lzc.deployment_preparations WHERE tenant_id=p_tenant) OR EXISTS(SELECT 1 FROM lzc.plan_runs WHERE tenant_id=p_tenant) THEN
 RAISE EXCEPTION 'organisation_not_empty_draft' USING ERRCODE='55000'; END IF;
 UPDATE lzc.tenants SET archived_at=now() WHERE id=p_tenant;
 UPDATE lzc_auth.sessions SET active_tenant_id=NULL WHERE active_tenant_id=p_tenant;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action) VALUES(p_tenant,u,u,'organisation_archived');
END $$;
REVOKE ALL ON FUNCTION lzc_auth.archive_organisation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.archive_organisation(uuid,uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.create_organisation(p_session uuid,p_name text,p_organization uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; t uuid;
BEGIN
 SELECT user_id INTO STRICT u FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text || ':' || p_organization::text || ':' || lower(btrim(p_name)),0));
 IF EXISTS(SELECT 1 FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id WHERE m.user_id=u AND t.archived_at IS NULL AND t.organization_id=p_organization AND lower(btrim(t.name))=lower(btrim(p_name))) THEN RAISE EXCEPTION 'organisation_already_exists' USING ERRCODE='23505'; END IF;
 INSERT INTO lzc.tenants(name,kind,organization_id) VALUES(p_name,'organisation',p_organization) RETURNING id INTO t;
 -- Legacy viewer prevents accidental deployment rights through the old runtime policies.
 INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles,manage_members) VALUES(t,u,'viewer',ARRAY['platform-engineer'],true);
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action) VALUES(t,u,u,'organisation_created');
 RETURN t;
END $$;

