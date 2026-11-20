-- Preserve previously private conversations under their original owner policies.
-- Sharing an existing transcript requires an explicit action by its author.
ALTER TABLE lzc.assistant_conversations RENAME TO assistant_personal_conversations;
ALTER TABLE lzc.assistant_personal_conversations RENAME CONSTRAINT assistant_conversations_pkey TO assistant_personal_conversations_pkey;
ALTER TABLE lzc.assistant_personal_conversations RENAME CONSTRAINT assistant_conversations_configuration_id_created_by_key TO assistant_personal_configuration_author_key;
ALTER INDEX lzc.assistant_expiration RENAME TO assistant_personal_expiration;

CREATE TABLE lzc.assistant_conversations (
 id uuid PRIMARY KEY,
 configuration_id uuid NOT NULL REFERENCES lzc.configurations(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC' + interval '3 months') AT TIME ZONE 'UTC'),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 base_revision integer NOT NULL,
 knowledge_hash text NOT NULL,
 messages jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(messages)='array' AND jsonb_array_length(messages)<=40),
 proposal jsonb,
 proposal_baseline jsonb,
 UNIQUE(configuration_id),
 UNIQUE(configuration_id,created_by)
);
ALTER TABLE lzc.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.assistant_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_read ON lzc.assistant_conversations FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer')
 AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY assistant_insert ON lzc.assistant_conversations FOR INSERT TO configurator_app
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id()
 AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY assistant_update ON lzc.assistant_conversations FOR UPDATE TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id))
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY assistant_delete ON lzc.assistant_conversations FOR DELETE TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY assistant_migration ON lzc.assistant_conversations TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,DELETE ON lzc.assistant_conversations TO configurator_app;
GRANT INSERT(id,configuration_id,tenant_id,created_by,base_revision,knowledge_hash) ON lzc.assistant_conversations TO configurator_app;
GRANT UPDATE(revision,base_revision,messages,proposal,proposal_baseline,knowledge_hash) ON lzc.assistant_conversations TO configurator_app;
CREATE INDEX assistant_expiration ON lzc.assistant_conversations(expires_at);

ALTER TABLE lzc.assistant_configuration_context ADD COLUMN workspace_shared boolean NOT NULL DEFAULT false;
ALTER TABLE lzc.assistant_configuration_context ALTER COLUMN advice_id DROP NOT NULL;
ALTER TABLE lzc.assistant_configuration_context DROP CONSTRAINT assistant_configuration_context_advice_id_fkey;
ALTER TABLE lzc.assistant_configuration_context ADD CONSTRAINT assistant_context_advice_source
 FOREIGN KEY(advice_id) REFERENCES lzc.assistant_template_advice(id) ON DELETE SET NULL;
DROP POLICY context_owner ON lzc.assistant_configuration_context;
CREATE POLICY context_read ON lzc.assistant_configuration_context FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (created_by=lzc.current_user_id() OR workspace_shared)
 AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY context_insert ON lzc.assistant_configuration_context FOR INSERT TO configurator_app
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id()
 AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id)
 AND EXISTS(SELECT 1 FROM lzc.assistant_template_advice a WHERE a.id=advice_id));
CREATE POLICY context_share ON lzc.assistant_configuration_context FOR UPDATE TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')
 AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id))
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')
 AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
CREATE POLICY context_delete ON lzc.assistant_configuration_context FOR DELETE TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (created_by=lzc.current_user_id() OR workspace_shared)
 AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));
GRANT INSERT(workspace_shared) ON lzc.assistant_configuration_context TO configurator_app;
GRANT UPDATE(workspace_shared) ON lzc.assistant_configuration_context TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.prune_assistant_conversations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 DELETE FROM lzc.assistant_conversations WHERE expires_at<=now()
 OR EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_personal_conversations WHERE expires_at<=now()
 OR EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_template_advice WHERE expires_at<=now()
 OR EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
 DELETE FROM lzc.assistant_configuration_context WHERE expires_at<=now()
 OR EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL);
END $$;
