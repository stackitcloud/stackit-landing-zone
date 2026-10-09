CREATE POLICY application_job_approver_read ON lzc.application_jobs FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer') AND EXISTS(
  SELECT 1 FROM lzc.application_job_grants g WHERE g.job_id=id AND g.tenant_id=lzc.current_tenant_id() AND g.approved_by=lzc.current_user_id()
 ));