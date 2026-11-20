ALTER POLICY configuration_read ON lzc.configurations
 USING (tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer'));

ALTER POLICY configuration_update ON lzc.configurations
 USING (tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer'))
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer'));

ALTER POLICY configuration_delete ON lzc.configurations
 USING (tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer'));
