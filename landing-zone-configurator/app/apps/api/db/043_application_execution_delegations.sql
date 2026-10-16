CREATE TABLE lzc.application_execution_delegations (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 platform_revision uuid NOT NULL REFERENCES lzc.application_platform_contracts(revision),
 delegated_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL,
 credential_key_id text NOT NULL,
 backend_id uuid NOT NULL REFERENCES lzc.state_backends(id),
 backend_identity text NOT NULL,
 backend_credentials_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE(id,tenant_id)
);
CREATE UNIQUE INDEX active_application_execution_delegation ON lzc.application_execution_delegations(tenant_id,platform_revision) WHERE revoked_at IS NULL;
CREATE TABLE lzc.application_job_delegations (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_jobs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 delegation_id uuid NOT NULL,
 FOREIGN KEY(delegation_id,tenant_id) REFERENCES lzc.application_execution_delegations(id,tenant_id)
);
ALTER TABLE lzc.application_execution_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_execution_delegations FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_job_delegations FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_delegation_read ON lzc.application_execution_delegations FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY job_delegation_read ON lzc.application_job_delegations FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.id=job_id AND j.tenant_id=lzc.current_tenant_id()));
CREATE POLICY execution_delegation_migration ON lzc.application_execution_delegations TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY job_delegation_migration ON lzc.application_job_delegations TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_execution_delegations,lzc.application_job_delegations TO configurator_app;
CREATE TRIGGER immutable_job_delegation BEFORE UPDATE OR DELETE ON lzc.application_job_delegations FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
CREATE FUNCTION lzc.guard_application_execution_delegation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
  RAISE EXCEPTION 'immutable_application_execution_delegation' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_execution_delegation BEFORE UPDATE OR DELETE ON lzc.application_execution_delegations FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_delegation();

CREATE FUNCTION lzc_auth.configure_application_execution(p_session uuid,p_revision uuid,p_backend uuid,p_revoke boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE contract lzc.application_platform_contracts; backend lzc.state_backends; binding lzc.application_execution_delegations;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO contract FROM lzc.application_platform_contracts WHERE revision=p_revision AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_execution_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO binding FROM lzc.application_execution_delegations WHERE tenant_id=contract.tenant_id AND platform_revision=p_revision AND revoked_at IS NULL FOR UPDATE;
 IF p_revoke THEN
  IF FOUND THEN UPDATE lzc.application_execution_delegations SET revoked_at=now() WHERE id=binding.id; END IF;
  RETURN binding.id;
 END IF;
 SELECT * INTO backend FROM lzc.state_backends WHERE id=p_backend AND tenant_id=contract.tenant_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.credential_profiles p WHERE p.id=contract.credential_profile_id AND p.tenant_id=contract.tenant_id AND p.owner_user_id=contract.approved_by AND p.state='stored' AND p.key_id=contract.credential_key_id) THEN
  RAISE EXCEPTION 'application_execution_resources_unavailable' USING ERRCODE='42501';
 END IF;
 IF binding.id IS NOT NULL THEN
  IF binding.backend_id<>p_backend THEN RAISE EXCEPTION 'application_execution_binding_conflict' USING ERRCODE='40001'; END IF;
  RETURN binding.id;
 END IF;
 INSERT INTO lzc.application_execution_delegations(id,tenant_id,platform_revision,delegated_by,credential_profile_id,credential_version,credential_key_id,backend_id,backend_identity,backend_credentials_hash)
 VALUES(gen_random_uuid(),contract.tenant_id,p_revision,contract.approved_by,contract.credential_profile_id,contract.credential_version,contract.credential_key_id,backend.id,backend.identity_sha256,md5(encode(backend.credentials_ciphertext,'hex'))) RETURNING id INTO binding.id;
 RETURN binding.id;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.configure_application_execution(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.configure_application_execution(uuid,uuid,uuid,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.bind_application_job_execution(p_session uuid,p_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE grant_row lzc.application_job_grants; binding lzc.application_execution_delegations; backend lzc.state_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_grant_unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_job_delegations WHERE job_id=p_job) THEN RETURN true; END IF;
 SELECT * INTO binding FROM lzc.application_execution_delegations WHERE tenant_id=grant_row.tenant_id AND platform_revision=grant_row.platform_revision AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF grant_row.revoked_at IS NOT NULL OR grant_row.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM lzc.application_jobs WHERE id=p_job AND created_at=transaction_timestamp()) THEN
  RAISE EXCEPTION 'application_execution_binding_conflict' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_job_backends WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_execution_binding_conflict' USING ERRCODE='40001';
 END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,grant_row.instance_id);
 SELECT * INTO backend FROM lzc.state_backends WHERE id=binding.backend_id AND tenant_id=binding.tenant_id;
 INSERT INTO lzc.application_job_delegations(job_id,tenant_id,delegation_id) VALUES(p_job,binding.tenant_id,binding.id);
 INSERT INTO lzc.application_job_backends(job_id,tenant_id,owner_user_id,approved_by,backend_id,descriptor,approval_session_id,expires_at)
 VALUES(p_job,grant_row.tenant_id,grant_row.owner_user_id,grant_row.approved_by,backend.id,backend.descriptor || jsonb_build_object('key',grant_row.state_key,'useLockfile',true),p_session,grant_row.expires_at);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.bind_application_job_execution(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.bind_application_job_execution(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.delegated_application_context(p_session uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE grant_row lzc.application_job_grants; binding lzc.application_execution_delegations; backend lzc.state_backends; ordered lzc.application_instances; profile lzc.credential_profiles;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_execution_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,grant_row.instance_id);
 PERFORM lzc_auth.assert_application_job_group(p_job);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=grant_row.instance_id AND tenant_id=grant_row.tenant_id;
 IF ordered.deployment_policy='approval-required' AND NOT EXISTS(SELECT 1 FROM lzc.application_order_decisions d WHERE d.instance_id=ordered.id AND d.tenant_id=ordered.tenant_id AND d.decision='approved') THEN
  RAISE EXCEPTION 'application_order_not_approved' USING ERRCODE='40001';
 END IF;
 SELECT d.* INTO binding FROM lzc.application_execution_delegations d JOIN lzc.application_job_delegations j ON j.delegation_id=d.id AND j.tenant_id=d.tenant_id WHERE j.job_id=p_job AND d.revoked_at IS NULL FOR SHARE OF d;
 SELECT * INTO profile FROM lzc.credential_profiles WHERE id=binding.credential_profile_id AND tenant_id=grant_row.tenant_id AND owner_user_id=binding.delegated_by;
 SELECT * INTO backend FROM lzc.state_backends WHERE id=binding.backend_id AND tenant_id=grant_row.tenant_id;
 IF binding.id IS NULL OR binding.platform_revision<>grant_row.platform_revision OR binding.delegated_by<>grant_row.approved_by OR binding.credential_profile_id<>grant_row.credential_profile_id OR binding.credential_version<>grant_row.credential_version OR binding.credential_key_id<>grant_row.credential_key_id
  OR profile.id IS NULL OR profile.state<>'stored' OR profile.key_id<>binding.credential_key_id OR backend.id IS NULL OR backend.identity_sha256<>binding.backend_identity OR md5(encode(backend.credentials_ciphertext,'hex'))<>binding.backend_credentials_hash
  OR NOT EXISTS(SELECT 1 FROM lzc.memberships m WHERE m.tenant_id=grant_row.tenant_id AND m.user_id=binding.delegated_by AND 'platform-engineer'=ANY(m.product_roles))
  OR NOT EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=grant_row.tenant_id AND t.organization_id=grant_row.organization_id AND t.organization_verified AND t.archived_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM lzc.stackit_identities human WHERE human.user_id=grant_row.owner_user_id AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() AND human.email=ordered.resolved_settings->>'owner_email') THEN
  RAISE EXCEPTION 'application_execution_unavailable' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('jobId',p_job,'acceleratorRevision',grant_row.accelerator_revision,'organizationId',grant_row.organization_id,'credentialProfileId',grant_row.credential_profile_id,'credentialVersion',grant_row.credential_version,'credentialKeyId',grant_row.credential_key_id,'credentialOwnerId',binding.delegated_by,'serviceAccount',profile.service_account,'expiresAt',grant_row.expires_at,'tenantId',grant_row.tenant_id,'instanceId',grant_row.instance_id,'backendId',backend.id,'descriptor',backend.descriptor || jsonb_build_object('key',grant_row.state_key,'useLockfile',true));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_context(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.delegated_application_operation(p_session uuid,p_job uuid,p_operation text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; grant_row lzc.application_job_grants; dispatched lzc.application_dispatches; existing lzc.application_runner_records; backend lzc.state_backends; ticket lzc.application_runner_tickets; claimed lzc.application_job_claims; artifact lzc.application_runner_records;
BEGIN
 IF p_operation='fail' THEN
  PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
  SELECT d.* INTO dispatched FROM lzc.application_dispatches d JOIN lzc.application_job_delegations j ON j.job_id=d.job_id AND j.tenant_id=d.tenant_id WHERE d.job_id=p_job AND d.tenant_id=lzc.current_tenant_id() AND d.owner_user_id=lzc.current_user_id() AND d.approval_session_id=p_session FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_binding_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_dispatches SET status=CASE WHEN runner_app_id IS NULL THEN 'failed' ELSE 'reconciliation_required' END,finished_at=now() WHERE job_id=p_job AND status IN ('reserved','starting','initializing','validating','planning');
  RETURN '{}'::jsonb;
 END IF;
 context:=lzc_auth.delegated_application_context(p_session,p_job);
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job AND tenant_id=grant_row.tenant_id FOR UPDATE;
 IF p_operation='reserve' THEN
  IF dispatched.job_id IS NOT NULL THEN RETURN jsonb_build_object('created',false); END IF;
  IF grant_row.accelerator_revision<>'c4b43c36af198985980b17626c48d357795e3fbd' OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN RAISE EXCEPTION 'application_dispatch_grant_consumed' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('application-dispatch:' || grant_row.tenant_id::text || ':' || grant_row.instance_id::text,0));
  IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=grant_row.tenant_id AND instance_id=grant_row.instance_id AND status NOT IN ('succeeded','failed')) THEN RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001'; END IF;
  INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id) VALUES(p_job,grant_row.tenant_id,grant_row.instance_id,grant_row.owner_user_id,grant_row.approved_by,p_session);
  RETURN jsonb_build_object('created',true);
 END IF;
 IF p_operation='ticket' THEN
  IF dispatched.status IS DISTINCT FROM 'reserved' OR dispatched.approval_session_id IS DISTINCT FROM p_session OR p_input->>'source' IS DISTINCT FROM grant_row.accelerator_revision OR p_input->>'lock' IS DISTINCT FROM 'd40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5' OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN RAISE EXCEPTION 'application_runner_binding_unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO lzc.application_runner_tickets(job_id,tenant_id,approval_session_id,ticket_hash,runner_package_id,accelerator_revision,provider_lock_sha256,expires_at) VALUES(p_job,grant_row.tenant_id,p_session,p_input->>'hash',(p_input->>'package')::uuid,p_input->>'source',p_input->>'lock',grant_row.expires_at);
  RETURN jsonb_build_object('expires_at',grant_row.expires_at);
 END IF;
 SELECT * INTO ticket FROM lzc.application_runner_tickets WHERE job_id=p_job AND tenant_id=grant_row.tenant_id AND approval_session_id=p_session AND expires_at>now();
 IF p_operation='bind' THEN
  IF ticket.job_id IS NULL OR ticket.runner_package_id IS DISTINCT FROM (p_input->>'package')::uuid OR ticket.consumed_at IS NOT NULL OR dispatched.status IS DISTINCT FROM 'reserved' OR dispatched.approval_session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'application_dispatch_binding_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_dispatches SET status='starting',runner_app_id=(p_input->>'app')::uuid,runner_package_id=ticket.runner_package_id WHERE job_id=p_job;
  RETURN '{}'::jsonb;
 END IF;
 IF ticket.job_id IS NULL OR dispatched.approval_session_id IS DISTINCT FROM p_session OR dispatched.status NOT IN ('starting','initializing','validating','planning') THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation='consume' THEN
  IF ticket.consumed_at IS NOT NULL OR ticket.ticket_hash IS DISTINCT FROM p_input->>'hash' OR ticket.runner_package_id IS DISTINCT FROM (p_input->>'package')::uuid OR ticket.accelerator_revision IS DISTINCT FROM p_input->>'source' OR ticket.provider_lock_sha256 IS DISTINCT FROM p_input->>'lock' THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_runner_tickets SET consumed_at=now() WHERE job_id=p_job;
  RETURN '{}'::jsonb;
 END IF;
 IF ticket.consumed_at IS NULL THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation='claim' THEN
  IF EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN RAISE EXCEPTION 'application_grant_consumed' USING ERRCODE='40001'; END IF;
  INSERT INTO lzc.application_job_claims(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,expires_at) VALUES(p_job,grant_row.tenant_id,grant_row.owner_user_id,grant_row.approved_by,p_session,grant_row.expires_at) RETURNING * INTO claimed;
  RETURN to_jsonb(claimed);
 END IF;
 IF p_operation IN ('credential','input','assert','stage','record','result') AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job AND approval_session_id=p_session AND expires_at>now()) THEN RAISE EXCEPTION 'application_credential_claim_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation='credential' THEN RETURN jsonb_build_object('context',context - ARRAY['tenantId','instanceId','backendId','descriptor']); END IF;
 IF p_operation='input' THEN
  SELECT * INTO backend FROM lzc.state_backends WHERE id=(context->>'backendId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.id=p_job AND j.inputs->>'acceleratorRevision'=grant_row.accelerator_revision AND j.inputs->>'stateKey'=grant_row.state_key AND j.inputs->>'requestedBy'=grant_row.owner_user_id::text AND j.operation='plan') THEN RAISE EXCEPTION 'application_runner_inputs_invalid' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('context',context || jsonb_build_object('backendCiphertext',encode(backend.credentials_ciphertext,'hex'),'variables',(SELECT inputs->'variables' FROM lzc.application_jobs WHERE id=p_job)));
 END IF;
 IF p_operation='assert' THEN RETURN '{}'::jsonb; END IF;
 IF p_operation='stage' THEN UPDATE lzc.application_dispatches SET status=p_input->>'stage' WHERE job_id=p_job; RETURN '{}'::jsonb; END IF;
 IF p_operation='record' THEN
  IF (p_input->>'kind'='artifact' AND dispatched.status<>'planning') OR p_input->>'kind' NOT IN ('artifact','output') THEN RAISE EXCEPTION 'application_record_unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO existing FROM lzc.application_runner_records WHERE job_id=p_job AND kind=p_input->>'kind';
  IF FOUND THEN
   IF existing.sha256 IS DISTINCT FROM p_input->>'sha' OR existing.summary IS DISTINCT FROM nullif(p_input->'summary','null'::jsonb) OR existing.truncated IS DISTINCT FROM (p_input->>'truncated')::boolean THEN RAISE EXCEPTION 'application_record_conflict' USING ERRCODE='40001'; END IF;
   RETURN jsonb_build_object('sha256',existing.sha256);
  END IF;
  INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,summary,truncated,binding_sha256,state_key,runner_package_id) VALUES(p_job,p_input->>'kind',grant_row.tenant_id,grant_row.owner_user_id,decode(p_input->>'cipher','hex'),p_input->>'sha',nullif(p_input->'summary','null'::jsonb),(p_input->>'truncated')::boolean,grant_row.binding_sha256,grant_row.state_key,ticket.runner_package_id);
  RETURN jsonb_build_object('sha256',p_input->>'sha');
 END IF;
 IF p_operation='result' THEN
  IF p_input->>'status' NOT IN ('succeeded','failed') THEN RAISE EXCEPTION 'application_result_unavailable' USING ERRCODE='42501'; END IF;
  IF p_input->>'status'='succeeded' THEN
   SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_job AND kind='artifact';
  IF dispatched.status<>'planning' OR artifact.job_id IS NULL OR artifact.sha256 IS DISTINCT FROM p_input->>'sha' OR artifact.summary IS DISTINCT FROM p_input->'summary' THEN RAISE EXCEPTION 'application_result_unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  UPDATE lzc.application_dispatches SET status=p_input->>'status',finished_at=now(),summary=nullif(p_input->'summary','null'::jsonb),error_code=p_input->>'error' WHERE job_id=p_job;
  RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'invalid_application_operation' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb) TO configurator_app;

CREATE FUNCTION lzc_auth.delegated_application_ready(p_session uuid,p_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.delegated_application_context(p_session,p_job);
 RETURN NOT EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE job_id=p_job) AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job);
EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_ready(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delegated_application_ready(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.resolve_delegated_application_runner(p_hash text,p_package uuid,p_source text,p_lock text,p_report boolean)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,least(s.expires_at,ticket.expires_at)
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.application_jobs j ON j.id=ticket.job_id AND j.owner_user_id=s.user_id
 JOIN lzc.application_job_delegations jd ON jd.job_id=j.id AND jd.tenant_id=j.tenant_id
 JOIN lzc.application_execution_delegations binding ON binding.id=jd.delegation_id AND binding.tenant_id=jd.tenant_id AND binding.revoked_at IS NULL
 JOIN lzc.application_dispatches d ON d.job_id=j.id AND d.runner_package_id=ticket.runner_package_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=j.tenant_id
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
  AND ticket.expires_at>now() AND s.expires_at>now() AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id AND ('application-owner'=ANY(m.product_roles) OR 'platform-engineer'=ANY(m.product_roles))
  AND (ticket.consumed_at IS NOT NULL)=p_report AND d.status IN ('starting','initializing','validating','planning');
$$;
REVOKE ALL ON FUNCTION lzc_auth.resolve_delegated_application_runner(text,uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.resolve_delegated_application_runner(text,uuid,text,text,boolean) TO configurator_app;