CREATE FUNCTION lzc_auth.bind_organization(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  session_row lzc_auth.sessions;
  tenant_row lzc.tenants;
  member_row lzc.memberships;
  access_row lzc.stackit_organization_access;
  active_tenant uuid;
  authorization_id uuid;
  binding jsonb;
BEGIN
  SELECT * INTO session_row FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  active_tenant:=coalesce(session_row.active_tenant_id,session_row.tenant_id);
  IF active_tenant IS DISTINCT FROM lzc.current_tenant_id() OR session_row.user_id IS DISTINCT FROM lzc.current_user_id() THEN
    RAISE EXCEPTION 'stale_tenant_context' USING ERRCODE='40001';
  END IF;
  SELECT * INTO member_row FROM lzc.memberships WHERE tenant_id=active_tenant AND user_id=session_row.user_id FOR SHARE;
  IF NOT FOUND OR NOT member_row.manage_members OR NOT ('platform-engineer'=ANY(member_row.product_roles)) THEN
    RAISE EXCEPTION 'organization_admin_proof_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO tenant_row FROM lzc.tenants WHERE id=active_tenant AND kind='organisation' AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_admin_proof_required' USING ERRCODE='42501'; END IF;
  SELECT a.* INTO access_row FROM lzc.stackit_organization_access a
  JOIN lzc.stackit_identities i ON i.user_id=a.user_id
  WHERE a.tenant_id=active_tenant AND a.user_id=session_row.user_id AND a.organization_id=tenant_row.organization_id
    AND a.valid_until>now() AND a.verified_at>=i.verified_at AND i.valid_until>=a.valid_until
    AND i.valid_until>now() AND i.revoked_at IS NULL AND i.issuer='https://accounts.stackit.cloud'
  FOR SHARE OF a,i;
  IF NOT FOUND OR coalesce(cardinality(access_row.owner_permissions),0)=0 OR (access_row.permissions @> access_row.owner_permissions) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'organization_admin_proof_required' USING ERRCODE='42501';
  END IF;
  SELECT a.id INTO authorization_id FROM lzc.stackit_organization_authorizations a
  WHERE a.tenant_id=active_tenant AND a.user_id=session_row.user_id AND a.organization_id=tenant_row.organization_id
    AND a.permissions=access_row.permissions AND a.owner_permissions=access_row.owner_permissions
    AND a.verified_at=access_row.verified_at AND a.valid_until=access_row.valid_until
  ORDER BY a.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_admin_proof_required' USING ERRCODE='42501'; END IF;
  SELECT details INTO binding FROM lzc_auth.membership_audit
  WHERE tenant_id=active_tenant AND action='organization_bound' ORDER BY created_at,id LIMIT 1;
  IF binding IS NULL THEN
    binding:=jsonb_build_object('tenantId',active_tenant,'organizationId',tenant_row.organization_id,'authorizationId',authorization_id,'boundBy',session_row.user_id,'boundAt',now());
    INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details)
    VALUES(active_tenant,session_row.user_id,'organization_bound',binding);
    UPDATE lzc.tenants SET organization_verified=true WHERE id=active_tenant;
  END IF;
  RETURN binding;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.bind_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.bind_organization(uuid) TO configurator_app;