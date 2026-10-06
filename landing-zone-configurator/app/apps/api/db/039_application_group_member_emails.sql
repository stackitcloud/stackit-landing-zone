CREATE FUNCTION lzc_auth.application_group_member_emails(p_session uuid,p_tenant uuid)
RETURNS TABLE(user_id uuid,email text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH overview AS (
  SELECT lzc_auth.organisation_overview(p_session) AS details
 )
 SELECT identity.user_id,identity.email
 FROM overview
 CROSS JOIN LATERAL jsonb_array_elements(overview.details->'members') member
 JOIN lzc.stackit_identities identity ON identity.user_id=(member->>'userId')::uuid
 WHERE (overview.details->>'userId')::uuid=lzc.current_user_id()
  AND (overview.details->>'activeTenantId')::uuid=p_tenant
  AND p_tenant=lzc.current_tenant_id()
  AND identity.revoked_at IS NULL
$$;

REVOKE ALL ON FUNCTION lzc_auth.application_group_member_emails(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_group_member_emails(uuid,uuid) TO configurator_app;