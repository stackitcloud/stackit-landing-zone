CREATE TABLE lzc.assistant_template_advice (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC' + interval '3 months') AT TIME ZONE 'UTC'),
 revision integer NOT NULL DEFAULT 1,
 messages jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(messages)='array' AND jsonb_array_length(messages)<=40),
 recommendation jsonb,
 UNIQUE(tenant_id,created_by)
);
ALTER TABLE lzc.assistant_template_advice ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.assistant_template_advice FORCE ROW LEVEL SECURITY;
CREATE POLICY advice_owner ON lzc.assistant_template_advice TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY advice_migration ON lzc.assistant_template_advice TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT,DELETE ON lzc.assistant_template_advice TO configurator_app;
GRANT INSERT(id,tenant_id,created_by) ON lzc.assistant_template_advice TO configurator_app;
GRANT UPDATE(revision,messages,recommendation) ON lzc.assistant_template_advice TO configurator_app;
CREATE OR REPLACE FUNCTION lzc_auth.prune_assistant_conversations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 DELETE FROM lzc.assistant_conversations WHERE expires_at<=now()
 OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_template_advice WHERE expires_at<=now()
 OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
END $$;