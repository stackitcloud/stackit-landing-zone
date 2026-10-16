ALTER TABLE lzc.plan_runs ADD COLUMN mode text NOT NULL DEFAULT 'initial-plan-only' CHECK(mode='initial-plan-only');
ALTER TABLE lzc.plan_runs ADD COLUMN engine_version text NOT NULL DEFAULT '1.12.6';
ALTER TABLE lzc.plan_runs ADD COLUMN provider_lock_sha256 text NOT NULL DEFAULT 'a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888';
ALTER TABLE lzc.plan_runs ADD COLUMN runner_droplet_id uuid;
GRANT UPDATE(runner_droplet_id) ON lzc.plan_runs TO configurator_app;
-- Do not mark an unrecorded app cleaned while an in-flight creation can still finish.
CREATE OR REPLACE FUNCTION lzc_auth.expire_plan_runs()
 RETURNS TABLE(id uuid,runner_app_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 BEGIN
 UPDATE lzc.plan_runs SET status='failed',error_code='timed_out',finished_at=now()
 WHERE expires_at<=now() AND status IN ('starting','initializing','validating','planning');
 RETURN QUERY SELECT r.id,r.runner_app_id FROM lzc.plan_runs r
 WHERE NOT r.cleaned AND r.finished_at<now()-interval '30 seconds'
 AND (r.runner_app_id IS NOT NULL OR r.expires_at<=now())
 ORDER BY r.finished_at LIMIT 20;
 END $$;
CREATE OR REPLACE FUNCTION lzc_auth.mark_plan_cleaned(p_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 UPDATE lzc.plan_runs SET cleaned=true WHERE id=p_id AND finished_at IS NOT NULL
 AND (runner_app_id IS NOT NULL OR expires_at<=now())
 $$;
