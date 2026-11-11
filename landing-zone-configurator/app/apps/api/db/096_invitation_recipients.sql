-- Display the address already bound to an emailed invitation to its current
-- workspace membership managers. Link-only invitations remain unassigned.
CREATE OR REPLACE FUNCTION lzc_auth.list_invitations(p_session uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.invitation_manager(p_session,p_tenant);
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'roles',i.product_roles,'manageMembers',i.manage_members,
  'expiresAt',i.expires_at,'createdAt',i.created_at,'recipientEmail',i.recipient_email,
  'mailStatus',(SELECT n.email_status FROM lzc_auth.notifications n WHERE n.resource_id=i.id AND n.kind='invitation')
 ) ORDER BY i.created_at DESC),'[]'::jsonb)
 FROM lzc_auth.invitations i WHERE i.tenant_id=p_tenant AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>now());
END $$;

-- STACKIT accounts do not necessarily have a GitHub login. Expose only current
-- workspace member identity fields through the existing manager-only overview.
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
 (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'login',u.github_login,'displayName',coalesce(nullif(u.display_name,''),u.github_login),'email',(SELECT h.email FROM lzc.stackit_identities h WHERE h.user_id=m.user_id AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL),'roles',m.product_roles,'manageMembers',m.manage_members) ORDER BY u.created_at),'[]'::jsonb) FROM lzc.memberships m JOIN lzc_auth.users u ON u.id=m.user_id WHERE m.tenant_id=active) ELSE '[]'::jsonb END);
END $$;

