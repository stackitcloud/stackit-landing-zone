CREATE OR REPLACE FUNCTION lzc.application_order_deletable(p_instance uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=p_instance AND i.tenant_id=lzc.current_tenant_id()
  AND (i.requested_by=lzc.current_user_id() OR lzc.application_role('platform-engineer'))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=i.id)
  AND NOT EXISTS(
   SELECT 1 FROM lzc.application_jobs job WHERE job.instance_id=i.id AND (
    job.operation='apply'
    OR (
     (
      EXISTS(SELECT 1 FROM lzc.application_dispatches dispatched WHERE dispatched.job_id=job.id)
      OR EXISTS(SELECT 1 FROM lzc.application_job_claims claimed WHERE claimed.job_id=job.id)
      OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=job.id)
     )
     AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches completed WHERE completed.job_id=job.id AND completed.status IN ('succeeded','failed'))
    )
   )
  )
 );
$$;
REVOKE ALL ON FUNCTION lzc.application_order_deletable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_order_deletable(uuid) TO configurator_app;