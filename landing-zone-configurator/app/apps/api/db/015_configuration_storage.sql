DROP POLICY configuration_read ON lzc.configurations;
DROP POLICY configuration_insert ON lzc.configurations;
DROP POLICY configuration_update ON lzc.configurations;

CREATE POLICY configuration_read ON lzc.configurations FOR SELECT TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY configuration_insert ON lzc.configurations FOR INSERT TO configurator_app
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY configuration_update ON lzc.configurations FOR UPDATE TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY configuration_delete ON lzc.configurations FOR DELETE TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
GRANT DELETE ON lzc.configurations TO configurator_app;