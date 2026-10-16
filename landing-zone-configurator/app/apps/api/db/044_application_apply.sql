ALTER TABLE lzc.application_jobs DROP CONSTRAINT application_jobs_operation_check;
ALTER TABLE lzc.application_jobs ADD CONSTRAINT application_jobs_operation_check CHECK(operation IN ('plan','apply'));
ALTER TABLE lzc.application_jobs ADD COLUMN plan_id uuid REFERENCES lzc.application_jobs(id);
ALTER TABLE lzc.application_jobs ADD COLUMN artifact_sha256 text CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE lzc.application_jobs ADD CONSTRAINT application_saved_plan CHECK((operation='plan' AND plan_id IS NULL AND artifact_sha256 IS NULL) OR (operation='apply' AND plan_id IS NOT NULL AND artifact_sha256 IS NOT NULL));
ALTER TABLE lzc.application_job_grants DROP CONSTRAINT application_job_grants_operation_check;
ALTER TABLE lzc.application_job_grants ADD CONSTRAINT application_job_grants_operation_check CHECK(operation IN ('plan','apply'));
ALTER TABLE lzc.application_dispatches DROP CONSTRAINT application_dispatch_status;
ALTER TABLE lzc.application_dispatches ADD CONSTRAINT application_dispatch_status CHECK(status IN ('reserved','starting','initializing','validating','planning','applying','succeeded','failed','reconciliation_required'));
ALTER TABLE lzc.application_runner_records DROP CONSTRAINT application_runner_records_kind_check;
ALTER TABLE lzc.application_runner_records ADD CONSTRAINT application_runner_records_kind_check CHECK(kind IN ('artifact','output','recovery'));

CREATE FUNCTION lzc_auth.application_apply_plan(p_session uuid,p_plan uuid,p_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE planned lzc.application_jobs; dispatched lzc.application_dispatches; artifact lzc.application_runner_records; binding lzc.application_job_delegations; grant_row lzc.application_job_grants;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO planned FROM lzc.application_jobs WHERE id=p_plan AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND operation='plan';
 IF NOT FOUND THEN RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,planned.instance_id);
 PERFORM lzc_auth.assert_application_job_group(p_plan);
 PERFORM 1 FROM lzc.application_instances WHERE id=planned.instance_id FOR UPDATE;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_plan;
 SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_plan AND kind='artifact';
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_plan;
 SELECT * INTO binding FROM lzc.application_job_delegations WHERE job_id=p_plan;
 IF dispatched.status IS DISTINCT FROM 'succeeded' OR artifact.job_id IS NULL OR artifact.sha256 IS DISTINCT FROM p_sha
  OR artifact.summary IS DISTINCT FROM dispatched.summary OR artifact.binding_sha256 IS DISTINCT FROM planned.binding_sha256
  OR artifact.state_key IS DISTINCT FROM grant_row.state_key OR artifact.runner_package_id IS DISTINCT FROM dispatched.runner_package_id
  OR grant_row.revoked_at IS NOT NULL OR binding.job_id IS NULL
  OR artifact.summary->>'completeness' IS DISTINCT FROM 'complete'
  OR artifact.summary->'checks'->>'fail' IS DISTINCT FROM '0' OR artifact.summary->'checks'->>'error' IS DISTINCT FROM '0'
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_delegations d WHERE d.id=binding.delegation_id AND d.tenant_id=planned.tenant_id AND d.revoked_at IS NULL)
  OR EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=planned.instance_id AND newer.tenant_id=planned.tenant_id AND newer.operation='plan' AND (newer.created_at,newer.id)>(planned.created_at,planned.id)) THEN
  RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='40001';
 END IF;
 RETURN jsonb_build_object('planId',p_plan,'instanceId',planned.instance_id,'delegationId',binding.delegation_id,'artifactSha256',artifact.sha256,'runnerPackageId',artifact.runner_package_id,'finishedAt',dispatched.finished_at);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_apply_plan(uuid,uuid,text) FROM PUBLIC;

CREATE FUNCTION lzc.validate_application_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; planned lzc.application_jobs;
BEGIN
 IF NEW.operation='plan' THEN
  PERFORM lzc_auth.require_active_application_order(NEW.issuer_session_id,NEW.instance_id);
  IF EXISTS(SELECT 1 FROM lzc.application_dispatches d JOIN lzc.application_jobs j ON j.id=d.job_id WHERE d.instance_id=NEW.instance_id AND d.tenant_id=NEW.tenant_id AND j.operation='apply' AND d.status NOT IN ('succeeded','failed')) THEN
   RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
 END IF;
 context:=lzc_auth.application_apply_plan(NEW.issuer_session_id,NEW.plan_id,NEW.artifact_sha256);
 SELECT * INTO planned FROM lzc.application_jobs WHERE id=NEW.plan_id;
 IF NEW.instance_id<>planned.instance_id OR NEW.owner_user_id<>planned.owner_user_id OR NEW.tenant_id<>planned.tenant_id
  OR NEW.inputs IS DISTINCT FROM planned.inputs OR NEW.binding_sha256<>planned.binding_sha256
  OR (context->>'finishedAt')::timestamptz+interval '1 hour'<=now()
  OR EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.plan_id=NEW.plan_id AND j.operation='apply') THEN
  RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.validate_application_apply() FROM PUBLIC;
CREATE TRIGGER validate_application_apply BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.validate_application_apply();

ALTER FUNCTION lzc_auth.delegated_application_context(uuid,uuid) RENAME TO delegated_application_plan_context;
CREATE FUNCTION lzc_auth.delegated_application_context(p_session uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; apply_context jsonb; job lzc.application_jobs;
BEGIN
 context:=lzc_auth.delegated_application_plan_context(p_session,p_job);
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 IF job.operation='apply' THEN
  apply_context:=lzc_auth.application_apply_plan(p_session,job.plan_id,job.artifact_sha256);
  IF (apply_context->>'delegationId')::uuid IS DISTINCT FROM (SELECT delegation_id FROM lzc.application_job_delegations WHERE job_id=p_job) THEN
   RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='42501';
  END IF;
  RETURN context || apply_context;
 END IF;
 RETURN context;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_context(uuid,uuid) FROM PUBLIC;

ALTER FUNCTION lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb) RENAME TO delegated_application_plan_operation;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb) FROM configurator_app;
CREATE FUNCTION lzc_auth.delegated_application_operation(p_session uuid,p_job uuid,p_operation text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; context jsonb; dispatched lzc.application_dispatches; grant_row lzc.application_job_grants; backend lzc.state_backends; existing lzc.application_runner_records; ticket lzc.application_runner_tickets;
BEGIN
 IF p_operation='fail' THEN
  PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
  SELECT d.* INTO dispatched FROM lzc.application_dispatches d JOIN lzc.application_job_delegations jd ON jd.job_id=d.job_id WHERE d.job_id=p_job AND d.tenant_id=lzc.current_tenant_id() AND d.owner_user_id=lzc.current_user_id() AND d.approval_session_id=p_session FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_binding_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_dispatches SET status=CASE WHEN runner_app_id IS NULL THEN 'failed' ELSE 'reconciliation_required' END,finished_at=now() WHERE job_id=p_job AND status IN ('reserved','starting','initializing','validating','planning','applying');
  RETURN '{}'::jsonb;
 END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 IF job.operation IS DISTINCT FROM 'apply' THEN RETURN lzc_auth.delegated_application_plan_operation(p_session,p_job,p_operation,p_input); END IF;
 context:=lzc_auth.delegated_application_context(p_session,p_job);
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job;
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job AND approval_session_id=p_session FOR UPDATE;
 IF p_operation='ticket' AND p_input->>'package' IS DISTINCT FROM context->>'runnerPackageId' THEN RAISE EXCEPTION 'application_apply_package_changed' USING ERRCODE='40001'; END IF;
 IF p_operation='reserve' AND (context->>'finishedAt')::timestamptz+interval '1 hour'<=now() THEN RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='40001'; END IF;
 IF p_operation NOT IN ('input','stage','record','result','assert','credential') THEN RETURN lzc_auth.delegated_application_plan_operation(p_session,p_job,p_operation,p_input); END IF;
 SELECT * INTO ticket FROM lzc.application_runner_tickets WHERE job_id=p_job AND approval_session_id=p_session AND consumed_at IS NOT NULL AND expires_at>now();
 IF ticket.job_id IS NULL OR dispatched.job_id IS NULL OR dispatched.status NOT IN ('starting','initializing','validating','applying') OR ticket.runner_package_id::text IS DISTINCT FROM context->>'runnerPackageId'
  OR NOT EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job AND approval_session_id=p_session AND expires_at>now()) THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation='assert' THEN RETURN '{}'::jsonb; END IF;
 IF p_operation='credential' THEN RETURN jsonb_build_object('context',context - ARRAY['tenantId','instanceId','backendId','descriptor','planId','artifactSha256','runnerPackageId','finishedAt','delegationId']); END IF;
 IF p_operation='input' THEN
  IF job.inputs->>'acceleratorRevision' IS DISTINCT FROM grant_row.accelerator_revision OR job.inputs->>'stateKey' IS DISTINCT FROM grant_row.state_key OR job.inputs->>'requestedBy' IS DISTINCT FROM grant_row.owner_user_id::text THEN RAISE EXCEPTION 'application_runner_inputs_invalid' USING ERRCODE='42501'; END IF;
  SELECT * INTO backend FROM lzc.state_backends WHERE id=(context->>'backendId')::uuid;
  RETURN jsonb_build_object('context',context || jsonb_build_object('backendCiphertext',encode(backend.credentials_ciphertext,'hex'),'variables',job.inputs->'variables','operation','apply'));
 END IF;
 IF p_operation='stage' THEN
  IF p_input->>'stage' NOT IN ('initializing','validating','applying') THEN RAISE EXCEPTION 'application_stage_invalid' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_dispatches SET status=p_input->>'stage' WHERE job_id=p_job;
  RETURN '{}'::jsonb;
 END IF;
 IF p_operation='record' THEN
  IF p_input->>'kind' NOT IN ('output','recovery') OR (p_input->>'kind'='recovery' AND dispatched.status<>'applying') THEN RAISE EXCEPTION 'application_record_unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO existing FROM lzc.application_runner_records WHERE job_id=p_job AND kind=p_input->>'kind';
  IF FOUND THEN
   IF existing.sha256 IS DISTINCT FROM p_input->>'sha' THEN RAISE EXCEPTION 'application_record_conflict' USING ERRCODE='40001'; END IF;
   RETURN jsonb_build_object('sha256',existing.sha256);
  END IF;
  INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,summary,truncated,binding_sha256,state_key,runner_package_id)
  VALUES(p_job,p_input->>'kind',job.tenant_id,job.owner_user_id,decode(p_input->>'cipher','hex'),p_input->>'sha',NULL,(p_input->>'truncated')::boolean,job.binding_sha256,grant_row.state_key,ticket.runner_package_id);
  RETURN jsonb_build_object('sha256',p_input->>'sha');
 END IF;
 IF p_operation='result' THEN
  IF p_input->>'status' NOT IN ('succeeded','failed') OR (p_input->>'status'='succeeded' AND (dispatched.status<>'applying' OR p_input->>'sha' IS NOT NULL OR nullif(p_input->'summary','null'::jsonb) IS NOT NULL OR p_input->>'error' IS NOT NULL OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery'))) THEN RAISE EXCEPTION 'application_result_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE lzc.application_dispatches SET status=CASE WHEN p_input->>'status'='failed' AND (dispatched.status='applying' OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery')) THEN 'reconciliation_required' ELSE p_input->>'status' END,finished_at=now(),error_code=p_input->>'error' WHERE job_id=p_job;
  RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'invalid_application_operation' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc.guard_application_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE operation text;
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','runner_app_id','runner_package_id','finished_at','summary','error_code']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','runner_app_id','runner_package_id','finished_at','summary','error_code']) OR OLD.status IN ('succeeded','failed','reconciliation_required') THEN RAISE EXCEPTION 'immutable_application_dispatch' USING ERRCODE='55000'; END IF;
 IF OLD.status='reserved' AND NEW.status='starting' AND OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT j.operation INTO operation FROM lzc.application_jobs j WHERE j.id=NEW.job_id;
 IF NEW.runner_app_id IS DISTINCT FROM OLD.runner_app_id OR NEW.runner_package_id IS DISTINCT FROM OLD.runner_package_id OR NOT (
  (OLD.status='starting' AND NEW.status='initializing') OR (OLD.status='initializing' AND NEW.status='validating') OR
  (OLD.status='validating' AND NEW.status=CASE WHEN operation='apply' THEN 'applying' ELSE 'planning' END) OR
  (OLD.status=CASE WHEN operation='apply' THEN 'applying' ELSE 'planning' END AND NEW.status='succeeded') OR NEW.status IN ('failed','reconciliation_required')
 ) OR (NEW.status<>'succeeded' AND NEW.summary IS DISTINCT FROM OLD.summary) THEN RAISE EXCEPTION 'invalid_application_dispatch_transition' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_delegated_application_runner(p_hash text,p_package uuid,p_source text,p_lock text,p_report boolean)
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
  AND ticket.expires_at>now() AND s.expires_at>now() AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id
  AND ('application-owner'=ANY(m.product_roles) OR 'platform-engineer'=ANY(m.product_roles))
  AND (ticket.consumed_at IS NOT NULL)=p_report AND d.status IN ('starting','initializing','validating','planning','applying');
$$;

CREATE FUNCTION lzc_auth.application_apply_available(p_session uuid,p_plan uuid,p_sha text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb;
BEGIN
 context:=lzc_auth.application_apply_plan(p_session,p_plan,p_sha);
 RETURN (context->>'finishedAt')::timestamptz+interval '1 hour'>now()
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs WHERE plan_id=p_plan AND operation='apply')
  AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE instance_id=(context->>'instanceId')::uuid AND status NOT IN ('succeeded','failed'));
EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_apply_available(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_apply_available(uuid,uuid,text) TO configurator_app;