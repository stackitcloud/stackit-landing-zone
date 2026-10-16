CREATE TABLE lzc.platform_reconciliations (
 run_id uuid PRIMARY KEY REFERENCES lzc.plan_runs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 session_id uuid NOT NULL,
 state_key text NOT NULL REFERENCES lzc.platform_states(state_key),
 state_version bigint NOT NULL CHECK(state_version>0),
 checkpoint_sha256 text NOT NULL CHECK(checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lzc.platform_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.platform_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY own_platform_reconciliation ON lzc.platform_reconciliations TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role());
CREATE POLICY migrate_platform_reconciliation ON lzc.platform_reconciliations TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.platform_reconciliations TO configurator_app;
CREATE FUNCTION lzc.protect_platform_reconciliation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN
 RAISE EXCEPTION 'immutable_platform_reconciliation' USING ERRCODE='23514';
 END $$;
REVOKE ALL ON FUNCTION lzc.protect_platform_reconciliation() FROM PUBLIC;
CREATE TRIGGER protect_platform_reconciliation BEFORE UPDATE OR DELETE ON lzc.platform_reconciliations
 FOR EACH ROW EXECUTE FUNCTION lzc.protect_platform_reconciliation();