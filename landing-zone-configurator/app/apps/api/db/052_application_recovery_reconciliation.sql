CREATE FUNCTION lzc_auth.application_recovery_reconciliation_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; dispatched lzc.application_dispatches; grant_row lzc.application_job_grants;
 ticket lzc.application_runner_tickets; delegation lzc.application_execution_delegations; reports jsonb;
BEGIN
 context:=lzc_auth.application_recovery_review_context(p_session,p_job);
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_recovery_review_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job AND tenant_id=grant_row.tenant_id;
 SELECT * INTO ticket FROM lzc.application_runner_tickets WHERE job_id=p_job AND tenant_id=grant_row.tenant_id;
 SELECT binding.* INTO delegation FROM lzc.application_execution_delegations binding
 JOIN lzc.application_job_delegations job ON job.delegation_id=binding.id AND job.tenant_id=binding.tenant_id
 WHERE job.job_id=p_job AND job.tenant_id=grant_row.tenant_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'sha256',sha256,'createdAt',created_at,'runnerPackageId',runner_package_id) ORDER BY kind),'[]'::jsonb)
 INTO reports FROM lzc.application_runner_records WHERE job_id=p_job AND tenant_id=grant_row.tenant_id;
 RETURN context || jsonb_build_object('reconciliation',jsonb_build_object(
  'observedAt',now(),
  'stage',CASE WHEN context->>'recoverySha256' IS NOT NULL THEN 'state-recovery-required'
   WHEN dispatched.job_id IS NULL THEN 'not-dispatched'
   WHEN dispatched.runner_app_id IS NULL THEN 'start-unresolved'
  WHEN dispatched.status='reconciliation_required' THEN 'completion-unresolved'
   WHEN dispatched.status='failed' THEN 'execution-failed'
   WHEN dispatched.status='succeeded' THEN 'reported-completion' ELSE 'execution-in-progress' END,
  'runnerAppId',dispatched.runner_app_id,'runnerStop','unknown','stateLock','unknown','cloudState','unknown',
  'credentialRevocation','unknown','authorizesExecution',false,
  'grant',jsonb_build_object('status',CASE WHEN grant_row.revoked_at IS NOT NULL THEN 'revoked' WHEN grant_row.expires_at<=now() THEN 'expired' ELSE 'unexpired' END,
   'expiresAt',grant_row.expires_at,'revokedAt',grant_row.revoked_at),
  'ticket',CASE WHEN ticket.job_id IS NULL THEN NULL ELSE jsonb_build_object(
   'status',CASE WHEN ticket.expires_at<=now() THEN 'expired' ELSE 'unexpired' END,'expiresAt',ticket.expires_at,'consumedAt',ticket.consumed_at) END,
  'delegation',CASE WHEN delegation.id IS NULL THEN 'not-used' WHEN delegation.revoked_at IS NOT NULL THEN 'revoked' ELSE 'not-revoked' END,
  'reports',reports));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_recovery_reconciliation_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_recovery_reconciliation_context(uuid,uuid) TO configurator_app;