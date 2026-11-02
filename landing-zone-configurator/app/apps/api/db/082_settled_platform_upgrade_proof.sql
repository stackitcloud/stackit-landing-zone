-- Completed bootstrap-to-remote migrations retain their markers for idempotent
-- confirmation. Only an independently recorded successful switch is settled;
-- pending, failed, mismatched and unproven migrations continue to block upgrades.
CREATE FUNCTION lzc_auth.platform_state_backend_settled(p_state lzc.platform_states) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(
  (p_state.migration_run_id IS NULL AND p_state.pending_backend_id IS NULL)
  OR (
   p_state.backend_id IS NOT NULL AND p_state.backend_id=p_state.pending_backend_id
   AND p_state.ciphertext IS NULL AND p_state.stable_aad AND nullif(p_state.remote_identity,'') IS NOT NULL
   AND p_state.migration_version IS NOT NULL AND p_state.migration_version>=0
   AND p_state.migration_sha256 ~ '^[a-f0-9]{64}$'
   AND p_state.version>p_state.migration_version
   AND EXISTS(SELECT 1 FROM lzc.plan_runs applied
    WHERE applied.id=p_state.migration_run_id AND applied.tenant_id=p_state.tenant_id
     AND applied.owner_user_id=p_state.owner_user_id AND applied.state_key=p_state.state_key
     AND applied.operation='apply' AND applied.mode='platform-apply'
     AND applied.status='succeeded' AND applied.finished_at IS NOT NULL
     AND applied.applied_state_version=p_state.migration_version+1)
  ),false);
$$;
REVOKE ALL ON FUNCTION lzc_auth.platform_state_backend_settled(lzc.platform_states) FROM PUBLIC;

CREATE OR REPLACE FUNCTION lzc_auth.application_platform_contract_current(p_revision uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source lzc.application_platform_sources; state lzc.platform_states;
BEGIN
 SELECT * INTO source FROM lzc.application_platform_sources WHERE revision=p_revision;
 IF source.revision IS NULL THEN RETURN false; END IF;
 SELECT * INTO state FROM lzc.platform_states WHERE state_key=source.state_key AND tenant_id=source.tenant_id FOR SHARE;
 RETURN state.state_key IS NOT NULL AND state.version=source.state_version AND state.lock_run_id IS NULL AND lzc_auth.platform_state_backend_settled(state)
  AND EXISTS(SELECT 1 FROM lzc.plan_runs applied WHERE applied.id=source.apply_run_id AND applied.tenant_id=source.tenant_id AND applied.operation='apply' AND applied.status='succeeded' AND applied.applied_state_version=source.state_version AND applied.state_key=source.state_key)
  AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs active WHERE active.tenant_id=source.tenant_id AND active.state_key=source.state_key AND active.operation='apply' AND active.status IN ('starting','initializing','validating','planning','applying','recovery_required'));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_platform_contract_current(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION lzc_auth.application_upgrade_platform_current(p_session uuid,p_revision uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 IF NOT EXISTS(SELECT 1 FROM lzc.application_platform_contracts WHERE revision=p_revision AND tenant_id=lzc.current_tenant_id()) THEN RETURN false; END IF;
 -- Advisory preview only: never take a State row lock before the request has
 -- obtained instance/workspace admission locks. The candidate trigger repeats
 -- the authoritative locked proof under the correct workspace -> State order.
 RETURN EXISTS(SELECT 1 FROM lzc.application_platform_sources source
  JOIN lzc.platform_states state ON state.state_key=source.state_key AND state.tenant_id=source.tenant_id
  JOIN lzc.plan_runs applied ON applied.id=source.apply_run_id AND applied.tenant_id=source.tenant_id
  WHERE source.revision=p_revision AND source.tenant_id=lzc.current_tenant_id()
   AND state.version=source.state_version AND state.lock_run_id IS NULL AND lzc_auth.platform_state_backend_settled(state)
   AND applied.operation='apply' AND applied.status='succeeded' AND applied.applied_state_version=source.state_version AND applied.state_key=source.state_key
   AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs active WHERE active.tenant_id=source.tenant_id AND active.state_key=source.state_key AND active.operation='apply' AND active.status IN ('starting','initializing','validating','planning','applying','recovery_required')));

END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_platform_current(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_platform_current(uuid,uuid) TO configurator_app;
