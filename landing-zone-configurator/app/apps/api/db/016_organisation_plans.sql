CREATE FUNCTION lzc.deployment_role() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS (
  SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=lzc.current_tenant_id() AND m.user_id=lzc.current_user_id()
   AND t.archived_at IS NULL AND (
    (t.kind='personal' AND m.role IN ('admin','deployer')) OR
    (t.kind='organisation' AND 'platform-engineer'=ANY(m.product_roles))
   )
 )
$$;
REVOKE ALL ON FUNCTION lzc.deployment_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.deployment_role() TO configurator_app;

ALTER POLICY own_preparation ON lzc.deployment_preparations
 USING (tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role() AND EXISTS (
  SELECT 1 FROM lzc.credential_profiles c WHERE c.id=credential_id AND c.tenant_id=lzc.current_tenant_id() AND c.owner_user_id=lzc.current_user_id()
 ));
ALTER POLICY own_plan ON lzc.plan_runs
 USING (tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role() AND EXISTS (
  SELECT 1 FROM lzc.deployment_preparations p WHERE p.id=preparation_id AND p.tenant_id=lzc.current_tenant_id() AND p.owner_user_id=lzc.current_user_id()
 ));