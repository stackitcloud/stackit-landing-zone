CREATE FUNCTION lzc_auth.application_job_credential_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; approved lzc.application_job_backends; claimed lzc.application_job_claims;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO claimed FROM lzc.application_job_claims
 WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id()
  AND approval_session_id=p_session AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_credential_claim_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=claimed.tenant_id FOR UPDATE;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND OR NOT EXISTS(
  SELECT 1 FROM lzc.tenants t WHERE t.id=g.tenant_id AND t.organization_id=g.organization_id AND t.organization_verified AND t.archived_at IS NULL
 ) THEN RAISE EXCEPTION 'application_credential_authority_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,approved.backend_id);
 RETURN jsonb_build_object('jobId',g.job_id,'acceleratorRevision',g.accelerator_revision,
  'organizationId',g.organization_id,'credentialProfileId',g.credential_profile_id,
  'credentialVersion',g.credential_version,'credentialKeyId',g.credential_key_id,
  'expiresAt',claimed.expires_at);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_job_credential_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_job_credential_context(uuid,uuid) TO configurator_app;