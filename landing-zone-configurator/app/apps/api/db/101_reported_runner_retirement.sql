-- A reported native Apply failure has already published its output and any
-- errored State. Retire its compute process, never its retained platform State.
ALTER TABLE lzc.plan_runs ADD COLUMN runner_stop_confirmed_at timestamptz;
CREATE INDEX reported_runner_retirement_queue ON lzc.plan_runs(finished_at,id)
 WHERE operation='apply' AND status='recovery_required' AND error_code='apply_failed'
 AND NOT cleaned AND runner_stop_confirmed_at IS NULL;

CREATE FUNCTION lzc_auth.reported_s3_apply_runners(p_run uuid DEFAULT NULL)
RETURNS TABLE(id uuid,runner_app_id uuid,runner_droplet_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT r.id,r.runner_app_id,r.runner_droplet_id
 FROM lzc.plan_runs r JOIN lzc.platform_states s ON s.state_key=r.state_key
 WHERE (p_run IS NULL OR r.id=p_run)
  AND r.operation='apply' AND r.status='recovery_required'
  AND r.error_code='apply_failed' AND r.input_claimed
  AND r.finished_at<now()-interval '30 seconds'
  AND r.runner_app_id IS NOT NULL AND r.runner_droplet_id IS NOT NULL
  AND NOT r.cleaned AND r.runner_stop_confirmed_at IS NULL
  AND s.backend_id IS NOT NULL AND s.ciphertext IS NULL AND s.lock_run_id IS NULL
  AND (s.pending_backend_id IS NULL OR s.pending_backend_id=s.backend_id)
  AND NOT EXISTS(SELECT 1 FROM lzc.state_recoveries recovery WHERE recovery.run_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs other WHERE other.id<>r.id
   AND other.runner_app_id=r.runner_app_id AND other.status IN ('starting','initializing','validating','planning','applying'))
 ORDER BY r.finished_at,r.id LIMIT 20;
$$;
REVOKE ALL ON FUNCTION lzc_auth.reported_s3_apply_runners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.reported_s3_apply_runners(uuid) TO configurator_app;

-- This timestamp only avoids repeated maintenance work. Checkpoint/reconcile
-- still independently inspect CF process/task termination on every request.
CREATE FUNCTION lzc_auth.record_reported_s3_runner_stopped(p_run uuid,p_app uuid,p_source uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE lzc.plan_runs r SET runner_stop_confirmed_at=clock_timestamp()
 WHERE r.id=p_run AND r.runner_app_id=p_app AND r.runner_droplet_id=p_source
 AND EXISTS(SELECT 1 FROM lzc_auth.reported_s3_apply_runners(p_run) candidate WHERE candidate.id=r.id);
$$;
REVOKE ALL ON FUNCTION lzc_auth.record_reported_s3_runner_stopped(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_reported_s3_runner_stopped(uuid,uuid,uuid) TO configurator_app;
