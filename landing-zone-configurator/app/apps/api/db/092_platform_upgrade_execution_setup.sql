-- Path release adopts only its explicitly selected predecessor's active backend.
-- Run in the publication transaction: failures leave delegation and path intact.
CREATE FUNCTION lzc_auth.prepare_application_platform_upgrade_execution(p_session uuid,p_from uuid,p_to uuid,p_predecessor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE predecessor lzc.application_execution_delegations; target_id uuid;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO predecessor FROM lzc.application_execution_delegations
  WHERE id=p_predecessor AND tenant_id=lzc.current_tenant_id() AND platform_revision=p_from AND revoked_at IS NULL FOR SHARE;
 IF predecessor.id IS NULL THEN RAISE EXCEPTION 'application_upgrade_execution_unavailable' USING ERRCODE='40001'; END IF;
 target_id:=lzc_auth.configure_application_execution(p_session,p_to,predecessor.backend_id,false);
 IF NOT EXISTS(SELECT 1 FROM lzc.application_execution_delegations target
  WHERE target.id=target_id AND target.tenant_id=predecessor.tenant_id AND target.revoked_at IS NULL
   AND target.backend_id=predecessor.backend_id AND target.backend_identity=predecessor.backend_identity
   AND target.backend_credentials_hash=predecessor.backend_credentials_hash)
 THEN RAISE EXCEPTION 'application_backend_binding_conflict' USING ERRCODE='40001'; END IF;
 RETURN target_id;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.prepare_application_platform_upgrade_execution(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.prepare_application_platform_upgrade_execution(uuid,uuid,uuid,uuid) TO configurator_app;
