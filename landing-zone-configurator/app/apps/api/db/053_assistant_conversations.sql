CREATE TABLE lzc.assistant_conversations (
 id uuid PRIMARY KEY,
 configuration_id uuid NOT NULL REFERENCES lzc.configurations(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC' + interval '3 months') AT TIME ZONE 'UTC'),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 base_revision integer NOT NULL,
 knowledge_hash text NOT NULL,
 messages jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(messages)='array' AND jsonb_array_length(messages)<=40),
 proposal jsonb,
 UNIQUE(configuration_id,created_by)
);

ALTER TABLE lzc.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.assistant_conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY assistant_owner ON lzc.assistant_conversations TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id()
 AND lzc.application_role('platform-engineer')
 AND EXISTS (SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id))
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND created_by=lzc.current_user_id()
 AND lzc.application_role('platform-engineer')
 AND EXISTS (SELECT 1 FROM lzc.configurations c WHERE c.id=configuration_id));

CREATE POLICY assistant_migration ON lzc.assistant_conversations TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT, DELETE ON lzc.assistant_conversations TO configurator_app;
GRANT INSERT(id,configuration_id,tenant_id,created_by,base_revision,knowledge_hash) ON lzc.assistant_conversations TO configurator_app;
GRANT UPDATE(revision,base_revision,messages,proposal) ON lzc.assistant_conversations TO configurator_app;
CREATE INDEX assistant_expiration ON lzc.assistant_conversations(expires_at);

CREATE FUNCTION lzc_auth.prune_assistant_conversations() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DELETE FROM lzc.assistant_conversations
 WHERE expires_at<=now() OR EXISTS (SELECT 1 FROM lzc.tenants t WHERE t.id=tenant_id AND t.archived_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION lzc_auth.prune_assistant_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.prune_assistant_conversations() TO configurator_app;