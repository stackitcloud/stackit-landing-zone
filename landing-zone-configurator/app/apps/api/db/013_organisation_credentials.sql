ALTER POLICY own_credential ON lzc.credential_profiles
 USING (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=credential_profiles.tenant_id AND m.user_id=lzc.current_user_id()
    AND ((t.kind='personal' AND m.role IN ('deployer','admin'))
      OR (t.kind='organisation' AND 'platform-engineer'=ANY(m.product_roles)))))
 WITH CHECK (tenant_id = lzc.current_tenant_id() AND owner_user_id = lzc.current_user_id() AND EXISTS (
  SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=credential_profiles.tenant_id AND m.user_id=lzc.current_user_id()
    AND ((t.kind='personal' AND m.role IN ('deployer','admin'))
      OR (t.kind='organisation' AND 'platform-engineer'=ANY(m.product_roles)))));