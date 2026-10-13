CREATE TABLE lzc.assistant_configuration_context (
 configuration_id uuid PRIMARY KEY REFERENCES lzc.configurations(id) ON DELETE CASCADE,
 advice_id uuid NOT NULL REFERENCES lzc.assistant_template_advice(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 advice_revision integer NOT NULL CHECK (advice_revision>0),
 expires_at timestamptz NOT NULL,
 messages jsonb NOT NULL CHECK (jsonb_typeof(messages)='array' AND jsonb_array_length(messages)<=40)
);
ALTER TABLE lzc.assistant_configuration_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.assistant_configuration_context FORCE ROW LEVEL SECURITY;
CREATE POLICY context_owner ON lzc.assistant_configuration_context TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')
 AND EXISTS (SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id)
 AND EXISTS (SELECT 1 FROM lzc.assistant_template_advice a WHERE a.id=advice_id));
CREATE POLICY context_migration ON lzc.assistant_configuration_context TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,DELETE ON lzc.assistant_configuration_context TO configurator_app;
CREATE OR REPLACE FUNCTION lzc_auth.prune_assistant_conversations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 DELETE FROM lzc.assistant_conversations WHERE expires_at<=now()
 OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_template_advice WHERE expires_at<=now()
 OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_configuration_context WHERE expires_at<=now()
 OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
END $$;