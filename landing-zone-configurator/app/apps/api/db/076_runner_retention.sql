-- Only stopped CF execution apps are candidates. Job/history/State rows are retained.
CREATE TABLE lzc.runner_cleanup_receipts (
 app_id uuid PRIMARY KEY,
 runner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('plan','warm')),
 removed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE lzc.runner_cleanup_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.runner_cleanup_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY runner_cleanup_migration ON lzc.runner_cleanup_receipts TO configurator_migration USING(true) WITH CHECK(true);

CREATE INDEX plan_runner_retention_app ON lzc.plan_runs(runner_app_id) WHERE runner_app_id IS NOT NULL;
CREATE INDEX application_runner_retention_app ON lzc.application_dispatches(runner_app_id) WHERE runner_app_id IS NOT NULL;
CREATE INDEX pool_runner_retention_app ON lzc.runner_pool_slots(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX recovery_runner_retention_app ON lzc.application_state_recovery_tasks(runner_app_id) WHERE runner_app_id IS NOT NULL;

-- A missing association is distinct from a durably finished association. Only
-- new origin-labelled apps may use the orphan path; legacy names alone are not ownership.
CREATE FUNCTION lzc_auth.runner_cleanup_disposition(p_runner uuid,p_app uuid,p_kind text)
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
    OR NOT (status IN ('succeeded','failed') OR (status='reconciliation_required' AND EXISTS(SELECT 1 FROM lzc.application_recovery_replans r WHERE r.job_id=d.job_id)))
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

CREATE FUNCTION lzc_auth.record_runner_cleanup(p_runner uuid,p_app uuid,p_kind text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO lzc.runner_cleanup_receipts(app_id,runner_id,kind) VALUES(p_app,p_runner,p_kind) ON CONFLICT(app_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION lzc_auth.record_runner_cleanup(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_runner_cleanup(uuid,uuid,text) TO configurator_app;
