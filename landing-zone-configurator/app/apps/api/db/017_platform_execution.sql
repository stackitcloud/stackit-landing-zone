ALTER TABLE lzc.plan_runs DROP CONSTRAINT plan_runs_status_check;
ALTER TABLE lzc.plan_runs DROP CONSTRAINT plan_runs_mode_check;
ALTER TABLE lzc.plan_runs ADD CONSTRAINT plan_runs_status_check CHECK(status IN ('starting','initializing','validating','planning','applying','succeeded','failed','cancelled','recovery_required'));
ALTER TABLE lzc.plan_runs ADD CONSTRAINT plan_runs_mode_check CHECK(mode IN ('initial-plan-only','platform-plan','platform-apply'));
ALTER TABLE lzc.plan_runs ADD COLUMN operation text NOT NULL DEFAULT 'plan' CHECK(operation IN ('plan','apply'));
ALTER TABLE lzc.plan_runs ADD COLUMN plan_id uuid REFERENCES lzc.plan_runs(id);
ALTER TABLE lzc.plan_runs ADD COLUMN artifact_sha256 text CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE lzc.plan_runs ADD COLUMN state_key text;
ALTER TABLE lzc.plan_runs ADD COLUMN state_version bigint;
ALTER TABLE lzc.plan_runs ADD COLUMN applied_state_version bigint;
ALTER TABLE lzc.plan_runs ADD CONSTRAINT execution_binding CHECK(
 (operation='plan' AND plan_id IS NULL AND mode IN ('initial-plan-only','platform-plan')) OR
 (operation='apply' AND plan_id IS NOT NULL AND artifact_sha256 IS NOT NULL AND mode='platform-apply' AND state_key IS NOT NULL AND state_version IS NOT NULL));
DROP INDEX lzc.plan_one_active_owner;
CREATE UNIQUE INDEX plan_one_active_owner ON lzc.plan_runs(tenant_id,owner_user_id)
 WHERE status IN ('starting','initializing','validating','planning','applying','recovery_required');
CREATE UNIQUE INDEX execution_one_active_state ON lzc.plan_runs(state_key)
 WHERE state_key IS NOT NULL AND status IN ('starting','initializing','validating','planning','applying','recovery_required');
CREATE UNIQUE INDEX execution_once_per_plan ON lzc.plan_runs(plan_id) WHERE operation='apply';
GRANT UPDATE(artifact_sha256,applied_state_version) ON lzc.plan_runs TO configurator_app;

CREATE TABLE lzc.platform_states (
 state_key text PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
 ciphertext bytea,
 lock_run_id uuid REFERENCES lzc.plan_runs(id),
 lock_id text,
 CHECK((lock_run_id IS NULL)=(lock_id IS NULL)),
 CHECK((version=0)=(ciphertext IS NULL))
);
CREATE TABLE lzc.plan_artifacts (
 run_id uuid PRIMARY KEY REFERENCES lzc.plan_runs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 29 AND 16777244),
 summary jsonb NOT NULL CHECK(summary->>'applyAllowed'='false'),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
 state_key text NOT NULL REFERENCES lzc.platform_states(state_key),
 state_version bigint NOT NULL,
 engine_version text NOT NULL,
 provider_lock_sha256 text NOT NULL,
 runner_droplet_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
);
ALTER TABLE lzc.platform_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.platform_states FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.plan_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.plan_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY own_platform_state ON lzc.platform_states TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role());
CREATE POLICY own_plan_artifact ON lzc.plan_artifacts TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role() AND EXISTS(
 SELECT 1 FROM lzc.plan_runs r WHERE r.id=run_id AND r.operation='plan' AND r.status='planning' AND r.input_claimed));
CREATE POLICY migrate_platform_state ON lzc.platform_states TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY migrate_plan_artifact ON lzc.plan_artifacts TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.platform_states,lzc.plan_artifacts TO configurator_app;
GRANT UPDATE(version,ciphertext,lock_run_id,lock_id) ON lzc.platform_states TO configurator_app;

CREATE FUNCTION lzc_auth.read_execution_configuration(p_id uuid)
 RETURNS TABLE(revision integer,document jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 BEGIN
 IF NOT lzc.deployment_role() THEN RETURN; END IF;
 RETURN QUERY SELECT c.revision,c.document FROM lzc.configurations c
 WHERE c.id=p_id AND c.tenant_id=lzc.current_tenant_id() AND c.created_by=lzc.current_user_id()
 FOR SHARE;
 END $$;
REVOKE ALL ON FUNCTION lzc_auth.read_execution_configuration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.read_execution_configuration(uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_plan_ticket(p_hash text)
 RETURNS TABLE(id uuid,tenant_id uuid,owner_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 SELECT r.id,r.tenant_id,r.owner_user_id FROM lzc.plan_runs r
 WHERE r.ticket_hash=p_hash AND r.expires_at>now()
 AND r.status IN ('starting','initializing','validating','planning','applying')
 $$;
CREATE OR REPLACE FUNCTION lzc_auth.expire_plan_runs()
 RETURNS TABLE(id uuid,runner_app_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 BEGIN
 UPDATE lzc.plan_runs SET status=CASE WHEN operation='apply' THEN 'recovery_required' ELSE 'failed' END,
 error_code='timed_out',finished_at=now()
 WHERE expires_at<=now() AND status IN ('starting','initializing','validating','planning','applying');
 RETURN QUERY SELECT r.id,r.runner_app_id FROM lzc.plan_runs r
 WHERE NOT r.cleaned AND r.finished_at<now()-interval '30 seconds'
 AND r.status<>'recovery_required'
 AND (r.runner_app_id IS NOT NULL OR r.expires_at<=now())
 ORDER BY r.finished_at LIMIT 20;
 END $$;