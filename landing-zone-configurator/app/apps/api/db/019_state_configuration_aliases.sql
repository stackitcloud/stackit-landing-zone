ALTER TABLE lzc.platform_states ADD CONSTRAINT state_tenant_key UNIQUE(tenant_id,state_key);

CREATE TABLE lzc.state_configuration_aliases (
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 configuration_id text NOT NULL,
 state_key text NOT NULL,
 PRIMARY KEY(tenant_id,configuration_id),
 FOREIGN KEY(tenant_id,state_key) REFERENCES lzc.platform_states(tenant_id,state_key)
);
ALTER TABLE lzc.state_configuration_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.state_configuration_aliases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_state_alias ON lzc.state_configuration_aliases TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role());
CREATE POLICY migrate_state_alias ON lzc.state_configuration_aliases TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.state_configuration_aliases TO configurator_app;

INSERT INTO lzc.state_configuration_aliases(tenant_id,configuration_id,state_key)
 SELECT tenant_id,configuration_id,state_key FROM lzc.platform_states WHERE configuration_id IS NOT NULL;