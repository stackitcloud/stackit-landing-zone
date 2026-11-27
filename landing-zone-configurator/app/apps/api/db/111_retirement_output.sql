ALTER TABLE lzc.retirement_jobs
 ADD COLUMN output_text text NOT NULL DEFAULT '' CHECK(octet_length(output_text)<=2097152),
 ADD COLUMN output_truncated boolean NOT NULL DEFAULT false;

CREATE FUNCTION lzc_auth.retirement_store_output(p_job uuid,p_text text,p_truncated boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_text IS NULL OR octet_length(p_text)>2097152 OR p_truncated IS NULL THEN
  RAISE EXCEPTION 'retirement_output_invalid' USING ERRCODE='22023'; END IF;
 UPDATE lzc.retirement_jobs job SET output_text=p_text,output_truncated=p_truncated
 WHERE job.id=p_job AND job.tenant_id=lzc.current_tenant_id() AND job.operator_id=lzc.current_user_id()
  AND job.input_claimed_at IS NOT NULL AND job.native_status IS NULL AND job.stopped_at IS NULL
  AND job.expires_at>clock_timestamp() AND job.status IN ('initializing','validating','planning','applying')
  AND EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=job.retirement_id AND r.generation=job.generation AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE'));
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_output_rejected' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_store_output(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_store_output(uuid,text,boolean) TO configurator_app;
