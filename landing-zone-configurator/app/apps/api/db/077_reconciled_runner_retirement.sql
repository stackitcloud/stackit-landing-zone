-- Reconciled interruptions have an immutable clearance too. Their original
-- warm app may still be desired STARTED with a CRASHED process; do not leak it.
-- Unknown recovery, active recovery and unexpired execution authority remain protected.
CREATE OR REPLACE FUNCTION lzc_auth.retire_completed_application_runners(p_space uuid,p_origin text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retired integer;
BEGIN
 UPDATE lzc.runner_pool_slots slot SET status='retiring',assignment=NULL,token_hash=NULL
 FROM lzc.application_dispatches dispatched
 WHERE slot.space_id=p_space AND slot.origin=p_origin AND slot.status='consumed'
  AND NOT slot.is_probe AND slot.job_id=dispatched.job_id
  AND slot.app_id=dispatched.runner_app_id AND slot.source_droplet_id=dispatched.runner_package_id
  AND (dispatched.status IN ('succeeded','failed') OR (
   dispatched.status='reconciliation_required'
   AND lzc_auth.application_recovery_replan_valid(dispatched.job_id)
   AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=dispatched.job_id AND t.expires_at>now())
   AND NOT EXISTS(SELECT 1 FROM lzc.application_state_recoveries r WHERE r.job_id=dispatched.job_id AND r.phase IN ('requested','assessing','prepared','committing','reconciliation-required'))
  ))
  AND dispatched.finished_at IS NOT NULL;
 GET DIAGNOSTICS retired=ROW_COUNT;
 RETURN retired;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retire_completed_application_runners(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retire_completed_application_runners(uuid,text) TO configurator_app;

-- Reuse the same established clearance validator for the stopped-app sweep.
CREATE OR REPLACE FUNCTION lzc_auth.runner_cleanup_disposition(p_runner uuid,p_app uuid,p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE known boolean:=false;
BEGIN
 IF p_kind NOT IN ('plan','warm') THEN RETURN 'protected'; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.id=p_runner AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=j.id AND d.runner_app_id=p_app))
  OR EXISTS(SELECT 1 FROM lzc.application_state_recovery_tasks WHERE id=p_runner OR runner_app_id=p_app)
  OR EXISTS(SELECT 1 FROM lzc.runner_pool_slots WHERE (id=p_runner OR app_id=p_app) AND
   (app_id IS DISTINCT FROM p_app OR (p_kind='warm' AND id<>p_runner) OR expires_at>now() OR status IN ('warming','ready','reserved','assigned')))
  OR EXISTS(SELECT 1 FROM lzc.plan_runs WHERE (id=p_runner OR runner_app_id=p_app) AND
   (runner_app_id IS DISTINCT FROM p_app OR (p_kind='plan' AND id<>p_runner) OR expires_at>now() OR finished_at IS NULL OR finished_at>now()-interval '30 seconds' OR status NOT IN ('succeeded','failed','cancelled')))
  OR EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE (job_id=p_runner OR runner_app_id=p_app) AND
   (runner_app_id IS DISTINCT FROM p_app OR (p_kind='plan' AND job_id<>p_runner) OR finished_at IS NULL OR finished_at>now()-interval '30 seconds'
    OR NOT (status IN ('succeeded','failed') OR (status='reconciliation_required' AND lzc_auth.application_recovery_replan_valid(d.job_id)))
    OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=d.job_id AND t.expires_at>now())
    OR EXISTS(SELECT 1 FROM lzc.application_state_recoveries r WHERE r.job_id=d.job_id AND r.phase IN ('requested','assessing','prepared','committing','reconciliation-required'))))
 THEN RETURN 'protected'; END IF;
 -- Consumed warm slots without a completed associated job are never mere orphans.
 IF EXISTS(SELECT 1 FROM lzc.runner_pool_slots s WHERE s.app_id=p_app AND s.status='consumed'
  AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs p WHERE p.id=s.job_id AND p.runner_app_id=p_app)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=s.job_id AND d.runner_app_id=p_app))
 THEN RETURN 'protected'; END IF;
 SELECT EXISTS(SELECT 1 FROM lzc.plan_runs WHERE runner_app_id=p_app)
  OR EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE runner_app_id=p_app)
  OR EXISTS(SELECT 1 FROM lzc.runner_pool_slots WHERE app_id=p_app AND id=p_runner AND p_kind='warm') INTO known;
 RETURN CASE WHEN known THEN 'completed' ELSE 'orphan' END;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.runner_cleanup_disposition(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.runner_cleanup_disposition(uuid,uuid,text) TO configurator_app;

