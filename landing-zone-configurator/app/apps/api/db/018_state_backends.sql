CREATE TABLE lzc.state_backends (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 descriptor jsonb NOT NULL,
 identity_sha256 text NOT NULL,
 credentials_ciphertext bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,identity_sha256)
);
ALTER TABLE lzc.state_backends ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.state_backends FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_backend ON lzc.state_backends TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role());
CREATE POLICY migrate_backend ON lzc.state_backends TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.state_backends TO configurator_app;

ALTER TABLE lzc.platform_states ADD COLUMN configuration_id text;
ALTER TABLE lzc.platform_states ADD COLUMN backend_id uuid REFERENCES lzc.state_backends(id);
ALTER TABLE lzc.platform_states ADD COLUMN stable_aad boolean NOT NULL DEFAULT false;
ALTER TABLE lzc.platform_states ADD COLUMN remote_identity text;
ALTER TABLE lzc.platform_states ADD COLUMN migration_run_id uuid REFERENCES lzc.plan_runs(id);
ALTER TABLE lzc.platform_states ADD COLUMN migration_version bigint;
ALTER TABLE lzc.platform_states ADD COLUMN migration_sha256 text;
ALTER TABLE lzc.platform_states ADD COLUMN pending_backend_id uuid REFERENCES lzc.state_backends(id);
ALTER TABLE lzc.platform_states ADD COLUMN runner_key_ciphertext bytea;
CREATE UNIQUE INDEX state_configuration ON lzc.platform_states(tenant_id,configuration_id) WHERE configuration_id IS NOT NULL;
CREATE UNIQUE INDEX state_backend ON lzc.platform_states(backend_id) WHERE backend_id IS NOT NULL;
DO $$ DECLARE constraint_name text; BEGIN
 SELECT conname INTO constraint_name FROM pg_constraint WHERE conrelid='lzc.platform_states'::regclass
 AND pg_get_constraintdef(oid) LIKE '%version = 0%ciphertext IS NULL%';
 IF constraint_name IS NULL THEN RAISE EXCEPTION 'Missing bootstrap state constraint'; END IF;
 EXECUTE format('ALTER TABLE lzc.platform_states DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE lzc.platform_states ADD CONSTRAINT primary_state_location CHECK(
 (backend_id IS NULL AND ((version=0)=(ciphertext IS NULL))) OR
 (backend_id IS NOT NULL AND ciphertext IS NULL));
ALTER POLICY own_platform_state ON lzc.platform_states
 USING(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role());
GRANT UPDATE(configuration_id,backend_id,stable_aad,remote_identity,migration_run_id,migration_version,migration_sha256,pending_backend_id,runner_key_ciphertext) ON lzc.platform_states TO configurator_app;

CREATE TABLE lzc.state_recoveries (
 run_id uuid PRIMARY KEY REFERENCES lzc.plan_runs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 state_key text NOT NULL REFERENCES lzc.platform_states(state_key),
 sha256 text NOT NULL,
 ciphertext bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lzc.state_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.state_recoveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_recovery ON lzc.state_recoveries TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND lzc.deployment_role() AND EXISTS(
 SELECT 1 FROM lzc.plan_runs r WHERE r.id=run_id AND r.operation='apply' AND r.status='applying' AND r.input_claimed AND r.expires_at>now()));
CREATE POLICY migrate_recovery ON lzc.state_recoveries TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.state_recoveries TO configurator_app;

CREATE FUNCTION lzc_auth.has_legacy_state(p_configuration text) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 SELECT lzc.deployment_role() AND EXISTS(
 SELECT 1 FROM lzc.platform_states s JOIN lzc.plan_runs r ON r.state_key=s.state_key
 JOIN lzc.deployment_preparations p ON p.id=r.preparation_id
 WHERE s.tenant_id=lzc.current_tenant_id() AND s.configuration_id IS NULL
 AND p.manifest->'source'->>'configurationId'=p_configuration)
 OR (lzc.deployment_role() AND EXISTS(SELECT 1 FROM lzc.platform_states s
 WHERE s.tenant_id=lzc.current_tenant_id() AND s.configuration_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs r WHERE r.state_key=s.state_key)))
 $$;
REVOKE ALL ON FUNCTION lzc_auth.has_legacy_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.has_legacy_state(text) TO configurator_app;