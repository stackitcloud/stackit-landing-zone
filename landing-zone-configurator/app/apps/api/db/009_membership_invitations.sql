-- Bearer invitations contain 256 random bits; only hashes are persisted.
CREATE TABLE lzc_auth.invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[A-Za-z0-9_-]{43}$'),
 product_roles text[] NOT NULL CHECK(cardinality(product_roles)>0 AND product_roles <@ ARRAY['platform-engineer','application-owner']::text[]),
 manage_members boolean NOT NULL CHECK(NOT manage_members OR 'platform-engineer'=ANY(product_roles)),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 revoked_at timestamptz,
 accepted_by uuid REFERENCES lzc_auth.users(id),
 accepted_at timestamptz
);
REVOKE ALL ON lzc_auth.invitations FROM PUBLIC, configurator_app;

CREATE FUNCTION lzc_auth.invitation_manager(p_session uuid,p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 IF coalesce(s.active_tenant_id,s.tenant_id)<>p_tenant THEN RAISE EXCEPTION 'stale_context' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM lzc.tenants WHERE id=p_tenant AND kind='organisation' AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=s.user_id AND manage_members) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN s.user_id;
END $$;
CREATE FUNCTION lzc_auth.create_invitation(p_session uuid,p_tenant uuid,p_hash text,p_roles text[],p_manage boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; i lzc_auth.invitations;
BEGIN
 u:=lzc_auth.invitation_manager(p_session,p_tenant);
 IF (SELECT count(*) FROM lzc_auth.invitations WHERE tenant_id=p_tenant AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())>=100 THEN RAISE EXCEPTION 'invitation_limit' USING ERRCODE='23514'; END IF;
 INSERT INTO lzc_auth.invitations(tenant_id,created_by,token_hash,product_roles,manage_members) VALUES(p_tenant,u,p_hash,p_roles,p_manage) RETURNING * INTO i;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,u,'invitation_created',jsonb_build_object('invitationId',i.id,'roles',p_roles,'manageMembers',p_manage));
 RETURN jsonb_build_object('id',i.id,'expiresAt',i.expires_at);
END $$;
CREATE FUNCTION lzc_auth.list_invitations(p_session uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.invitation_manager(p_session,p_tenant);
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'roles',product_roles,'manageMembers',manage_members,'expiresAt',expires_at,'createdAt',created_at) ORDER BY created_at DESC),'[]'::jsonb)
 FROM lzc_auth.invitations WHERE tenant_id=p_tenant AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now());
END $$;
CREATE FUNCTION lzc_auth.revoke_invitation(p_session uuid,p_tenant uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 u:=lzc_auth.invitation_manager(p_session,p_tenant);
 UPDATE lzc_auth.invitations SET revoked_at=now() WHERE id=p_id AND tenant_id=p_tenant AND revoked_at IS NULL AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,u,'invitation_revoked',jsonb_build_object('invitationId',p_id));
END $$;
CREATE FUNCTION lzc_auth.use_invitation(p_session uuid,p_hash text,p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; i lzc_auth.invitations; t lzc.tenants;
BEGIN
 SELECT user_id INTO STRICT u FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 SELECT * INTO i FROM lzc_auth.invitations WHERE token_hash=p_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM lzc.tenants WHERE id=i.tenant_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM lzc_auth.invitations WHERE token_hash=p_hash FOR UPDATE;
 IF i.expires_at<=now() OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=i.tenant_id AND user_id=i.created_by AND manage_members) THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 IF p_accept THEN
  IF EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=i.tenant_id AND user_id=u) THEN RAISE EXCEPTION 'already_member' USING ERRCODE='23505'; END IF;
  INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles,manage_members) VALUES(i.tenant_id,u,'viewer',i.product_roles,i.manage_members);
  UPDATE lzc_auth.invitations SET accepted_at=now(),accepted_by=u WHERE id=i.id;
  UPDATE lzc_auth.sessions SET active_tenant_id=i.tenant_id WHERE id=p_session;
  INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action,details) VALUES(i.tenant_id,u,u,'invitation_accepted',jsonb_build_object('invitationId',i.id,'roles',i.product_roles,'manageMembers',i.manage_members));
 END IF;
 RETURN jsonb_build_object('tenantId',i.tenant_id,'name',t.name,'organizationId',t.organization_id,'roles',i.product_roles,'manageMembers',i.manage_members);
END $$;
-- The old member API now edits existing members only. New members must consent.
ALTER FUNCTION lzc_auth.edit_organisation_member(uuid,uuid,text[],boolean,boolean,uuid) RENAME TO edit_existing_member_internal;
REVOKE ALL ON FUNCTION lzc_auth.edit_existing_member_internal(uuid,uuid,text[],boolean,boolean,uuid) FROM PUBLIC,configurator_app;
CREATE FUNCTION lzc_auth.edit_organisation_member(p_session uuid,p_user uuid,p_roles text[],p_manage boolean,p_remove boolean,p_expected_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.invitation_manager(p_session,p_expected_tenant);
 IF NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_expected_tenant AND user_id=p_user) THEN RAISE EXCEPTION 'invitation_required' USING ERRCODE='23503'; END IF;
 PERFORM lzc_auth.edit_existing_member_internal(p_session,p_user,p_roles,p_manage,p_remove,p_expected_tenant);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.invitation_manager(uuid,uuid),lzc_auth.create_invitation(uuid,uuid,text,text[],boolean),lzc_auth.list_invitations(uuid,uuid),lzc_auth.revoke_invitation(uuid,uuid,uuid),lzc_auth.use_invitation(uuid,text,boolean),lzc_auth.edit_organisation_member(uuid,uuid,text[],boolean,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.create_invitation(uuid,uuid,text,text[],boolean),lzc_auth.list_invitations(uuid,uuid),lzc_auth.revoke_invitation(uuid,uuid,uuid),lzc_auth.use_invitation(uuid,text,boolean),lzc_auth.edit_organisation_member(uuid,uuid,text[],boolean,boolean,uuid) TO configurator_app;
