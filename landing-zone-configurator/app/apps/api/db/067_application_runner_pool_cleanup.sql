-- Only durably completed, exactly bound Application runners are disposable.
CREATE FUNCTION lzc_auth.retire_completed_application_runners(p_space uuid,p_origin text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retired integer;
BEGIN
 UPDATE lzc.runner_pool_slots slot SET status='retiring',assignment=NULL,token_hash=NULL
 FROM lzc.application_dispatches dispatched
 WHERE slot.space_id=p_space AND slot.origin=p_origin AND slot.status='consumed'
  AND NOT slot.is_probe AND slot.job_id=dispatched.job_id
  AND slot.app_id=dispatched.runner_app_id AND slot.source_droplet_id=dispatched.runner_package_id
  AND dispatched.status IN ('succeeded','failed')
  AND dispatched.finished_at IS NOT NULL;
 GET DIAGNOSTICS retired=ROW_COUNT;
 RETURN retired;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retire_completed_application_runners(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retire_completed_application_runners(uuid,text) TO configurator_app;
