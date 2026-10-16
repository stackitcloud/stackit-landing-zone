CREATE FUNCTION lzc.application_order_archivable(p_instance uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=p_instance AND i.tenant_id=lzc.current_tenant_id()
  AND (i.requested_by=lzc.current_user_id() OR lzc.application_role('platform-engineer'))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=i.id)
  AND EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches completed ON completed.job_id=job.id
   WHERE job.instance_id=i.id AND job.operation='apply' AND completed.status IN ('failed','reconciliation_required') AND completed.finished_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs job WHERE job.instance_id=i.id AND (
   job.operation='apply'
   OR EXISTS(SELECT 1 FROM lzc.application_dispatches dispatched WHERE dispatched.job_id=job.id)
   OR EXISTS(SELECT 1 FROM lzc.application_job_claims claimed WHERE claimed.job_id=job.id)
   OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=job.id)
  ) AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches completed WHERE completed.job_id=job.id
   AND completed.finished_at IS NOT NULL
   AND (completed.status IN ('failed','reconciliation_required') OR (job.operation='plan' AND completed.status='succeeded'))))
 );
$$;
REVOKE ALL ON FUNCTION lzc.application_order_archivable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_order_archivable(uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.archive_application_order(p_session uuid,p_instance uuid)
RETURNS lzc.application_order_deletions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; archived lzc.application_order_deletions;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND OR (ordered.requested_by<>lzc.current_user_id() AND NOT lzc.application_role('platform-engineer')) THEN
  RAISE EXCEPTION 'application_deletion_access_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO archived FROM lzc.application_order_deletions WHERE instance_id=p_instance;
 IF FOUND THEN RETURN archived; END IF;
 IF NOT lzc.application_order_archivable(p_instance) THEN
  RAISE EXCEPTION 'application_order_archive_unavailable' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by)
 VALUES(ordered.id,ordered.tenant_id,lzc.current_user_id()) RETURNING * INTO archived;
 RETURN archived;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.archive_application_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.archive_application_order(uuid,uuid) TO configurator_app;