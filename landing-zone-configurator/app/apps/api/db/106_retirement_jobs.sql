CREATE TABLE lzc.retirement_jobs (
 id uuid PRIMARY KEY, retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 scope_id uuid NOT NULL REFERENCES lzc.retirement_execution_scopes(id), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 generation bigint NOT NULL, operator_id uuid NOT NULL REFERENCES lzc_auth.users(id), issuer_session_id uuid NOT NULL,
 control_grant_id uuid NOT NULL REFERENCES lzc.retirement_control_grants(id),
 operation text NOT NULL CHECK(operation IN ('plan','apply')),
 phase text NOT NULL CHECK(phase IN ('private_workloads','remove_application','remove_projects','finalize_folders')),
 source_revision text NOT NULL CHECK(source_revision ~ '^[0-9a-f]{40}$'), provider_lock_sha256 text NOT NULL CHECK(provider_lock_sha256 ~ '^[0-9a-f]{64}$'),
 variables_sha256 text NOT NULL CHECK(variables_sha256 ~ '^[0-9a-f]{64}$'), binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
 input_ciphertext bytea NOT NULL CHECK(octet_length(input_ciphertext) BETWEEN 29 AND 16777244),
 state_version bigint NOT NULL, before_state_ciphertext bytea NOT NULL CHECK(octet_length(before_state_ciphertext) BETWEEN 29 AND 16777244),
 ticket_hash text NOT NULL UNIQUE CHECK(ticket_hash ~ '^[A-Za-z0-9_-]{43}$'),
 status text NOT NULL DEFAULT 'starting' CHECK(status IN ('starting','initializing','validating','planning','applying','succeeded','failed','recovery_required')),
 input_claimed_at timestamptz, runner_app_id uuid, runner_package_id uuid, CHECK((runner_app_id IS NULL)=(runner_package_id IS NULL)),
 plan_id uuid REFERENCES lzc.retirement_jobs(id), approved_sha256 text CHECK(approved_sha256 ~ '^[0-9a-f]{64}$'),
 artifact_ciphertext bytea, artifact_sha256 text CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$'), projection jsonb, plan_sha256 text CHECK(plan_sha256 ~ '^[0-9a-f]{64}$'),
 recovery_adopted_at timestamptz,
 native_status text CHECK(native_status IN ('succeeded','failed')), result jsonb, recovery_ciphertext bytea,
 stopped_at timestamptz, stopped_stage text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '20 minutes',
 CHECK((operation='plan' AND plan_id IS NULL AND approved_sha256 IS NULL) OR (operation='apply' AND plan_id IS NOT NULL AND approved_sha256 IS NOT NULL)),
 CHECK(artifact_ciphertext IS NULL OR octet_length(artifact_ciphertext) BETWEEN 29 AND 16777244),
 CHECK(recovery_ciphertext IS NULL OR octet_length(recovery_ciphertext) BETWEEN 29 AND 16777244)
);
CREATE UNIQUE INDEX retirement_one_job ON lzc.retirement_jobs(retirement_id) WHERE status IN ('starting','initializing','validating','planning','applying','recovery_required');
CREATE UNIQUE INDEX retirement_apply_once ON lzc.retirement_jobs(plan_id) WHERE operation='apply';
ALTER TABLE lzc.retirement_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.retirement_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY retirement_jobs_migration ON lzc.retirement_jobs TO configurator_migration USING(true) WITH CHECK(true);
ALTER TABLE lzc.retirement_execution_scopes ADD FOREIGN KEY(lock_run_id) REFERENCES lzc.retirement_jobs(id);

CREATE FUNCTION lzc_auth.retirement_scope_context(p_session uuid,p_id uuid,p_generation bigint,p_scope uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; result jsonb;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase IN ('PAUSED','CANCELLED','COMPLETE') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 SELECT jsonb_build_object('retirementId',r.id,'generation',r.generation,'organizationId',r.organization_id,'notBefore',r.not_before,
  'scope',to_jsonb(scope),'inventory',to_jsonb(inventory),'grant',to_jsonb(grant_row)) INTO result
 FROM lzc.retirement_execution_scopes scope JOIN lzc.retirement_inventories inventory ON inventory.id=scope.inventory_id
 JOIN lzc.retirement_control_grants grant_row ON grant_row.retirement_id=r.id AND grant_row.generation=r.generation
 WHERE scope.id=p_scope AND scope.retirement_id=r.id AND grant_row.operator_id=lzc.current_user_id();
 IF result IS NULL THEN RAISE EXCEPTION 'retirement_control_grant_unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_start_job(p_session uuid,p_id uuid,p_generation bigint,p_scope uuid,p_job uuid,p_ticket text,
 p_phase text,p_revision text,p_lock text,p_variables text,p_binding text,p_input bytea,p_version bigint,p_plan uuid DEFAULT NULL,p_artifact text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; scope lzc.retirement_execution_scopes; grant_row lzc.retirement_control_grants; saved lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase NOT IN ('PREPARED','TEARING_DOWN','WAITING_FOR_PURGE','FINALIZING','NEEDS_ATTENTION') OR clock_timestamp()<r.not_before THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(lzc_auth.retirement_blockers(r.id))>0 THEN RAISE EXCEPTION 'retirement_writers_unresolved' USING ERRCODE='40001'; END IF;
 SELECT * INTO scope FROM lzc.retirement_execution_scopes WHERE id=p_scope AND retirement_id=r.id FOR UPDATE;
 SELECT * INTO grant_row FROM lzc.retirement_control_grants WHERE retirement_id=r.id AND generation=r.generation AND operator_id=lzc.current_user_id();
 IF scope.id IS NULL OR grant_row.id IS NULL THEN RAISE EXCEPTION 'retirement_control_grant_unavailable' USING ERRCODE='42501'; END IF;
 IF scope.stage<>p_phase OR scope.state_version<>p_version OR scope.lock_run_id IS NOT NULL THEN RAISE EXCEPTION 'retirement_state_changed' USING ERRCODE='40001'; END IF;
 IF scope.instance_id IS NULL AND EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes application_scope WHERE application_scope.retirement_id=r.id AND application_scope.instance_id IS NOT NULL AND application_scope.stage<>'complete') THEN
  RAISE EXCEPTION 'retirement_applications_pending' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM lzc.retirement_jobs job WHERE job.retirement_id=r.id AND
  (job.status IN ('starting','initializing','validating','planning','applying','recovery_required') OR (job.input_claimed_at IS NOT NULL AND job.stopped_at IS NULL))) THEN
  RAISE EXCEPTION 'retirement_writers_unresolved' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.credential_profiles profile WHERE profile.id=grant_row.credential_profile_id AND profile.tenant_id=r.tenant_id AND profile.owner_user_id=lzc.current_user_id() AND profile.key_id=grant_row.credential_key_id AND profile.state='stored') THEN
  RAISE EXCEPTION 'retirement_cleanup_identity_unverified' USING ERRCODE='42501'; END IF;
 IF p_plan IS NOT NULL THEN
  SELECT * INTO saved FROM lzc.retirement_jobs WHERE id=p_plan FOR UPDATE;
  IF saved.id IS NULL OR saved.retirement_id<>r.id OR saved.scope_id<>scope.id OR saved.generation<>r.generation OR saved.operator_id<>lzc.current_user_id()
   OR saved.operation<>'plan' OR saved.status<>'succeeded' OR saved.artifact_sha256 IS DISTINCT FROM p_artifact OR saved.artifact_ciphertext IS NULL
   OR saved.binding_sha256<>p_binding OR saved.phase<>p_phase OR saved.source_revision<>p_revision OR saved.provider_lock_sha256<>p_lock OR saved.variables_sha256<>p_variables
   OR saved.state_version<>scope.state_version OR saved.control_grant_id<>grant_row.id OR saved.created_at<clock_timestamp()-interval '30 minutes' OR saved.stopped_at IS NULL THEN
   RAISE EXCEPTION 'retirement_plan_not_approvable' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO lzc.retirement_jobs(id,retirement_id,scope_id,tenant_id,generation,operator_id,issuer_session_id,control_grant_id,operation,phase,
  source_revision,provider_lock_sha256,variables_sha256,binding_sha256,input_ciphertext,state_version,before_state_ciphertext,ticket_hash,plan_id,approved_sha256)
 VALUES(p_job,r.id,scope.id,r.tenant_id,r.generation,lzc.current_user_id(),p_session,grant_row.id,CASE WHEN p_plan IS NULL THEN 'plan' ELSE 'apply' END,p_phase,
  p_revision,p_lock,p_variables,p_binding,p_input,scope.state_version,scope.current_state_ciphertext,p_ticket,p_plan,p_artifact);
 IF p_plan IS NOT NULL AND scope.instance_id IS NULL THEN
  -- Orders which never obtained execution authority need no cloud destruction.
  -- Archive them only as part of the actual owner's reviewed Root Apply.
  INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by)
  SELECT (item->>'id')::uuid,r.tenant_id,lzc.current_user_id() FROM jsonb_array_elements(r.applications) item
  WHERE NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes child WHERE child.retirement_id=r.id AND child.instance_id=(item->>'id')::uuid)
   AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs original_job WHERE original_job.instance_id=(item->>'id')::uuid AND original_job.operation='apply')
  ON CONFLICT DO NOTHING;
 END IF;
 IF p_plan IS NOT NULL THEN
  UPDATE lzc.platform_retirements SET destructive_started_at=coalesce(destructive_started_at,clock_timestamp()),phase=CASE WHEN p_phase='finalize_folders' THEN 'FINALIZING' ELSE 'TEARING_DOWN' END WHERE id=r.id;
 END IF;
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(r.id,lzc.current_user_id(),r.generation,CASE WHEN p_plan IS NULL THEN 'plan-started' ELSE 'apply-approved' END);
 RETURN p_job;
END $$;
CREATE FUNCTION lzc_auth.resolve_retirement_ticket(p_hash text,p_recovery boolean DEFAULT false) RETURNS TABLE(id uuid,tenant_id uuid,operator_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT job.id,job.tenant_id,job.operator_id FROM lzc.retirement_jobs job WHERE job.ticket_hash=p_hash AND (job.expires_at>clock_timestamp() OR (p_recovery AND job.input_claimed_at IS NOT NULL AND job.stopped_at IS NULL));
$$;
CREATE FUNCTION lzc_auth.retirement_runner_context(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('job',to_jsonb(job),'scope',to_jsonb(scope),'grant',to_jsonb(grant_row),'inventory',to_jsonb(inventory),
  'parentGeneration',r.generation,'parentPhase',r.phase,'organizationId',r.organization_id,
  'plan',CASE WHEN saved.id IS NULL THEN NULL ELSE to_jsonb(saved) END) INTO result
 FROM lzc.retirement_jobs job JOIN lzc.platform_retirements r ON r.id=job.retirement_id
 JOIN lzc.retirement_execution_scopes scope ON scope.id=job.scope_id JOIN lzc.retirement_control_grants grant_row ON grant_row.id=job.control_grant_id
 JOIN lzc.retirement_inventories inventory ON inventory.id=scope.inventory_id LEFT JOIN lzc.retirement_jobs saved ON saved.id=job.plan_id
 WHERE job.id=p_job AND job.tenant_id=lzc.current_tenant_id() AND job.operator_id=lzc.current_user_id();
 IF result IS NULL THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_record_dispatch(p_session uuid,p_job uuid,p_app uuid,p_package uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() FOR UPDATE;
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=job.retirement_id;
 IF job.id IS NULL OR job.status<>'starting' OR job.runner_app_id IS NOT NULL OR job.expires_at<=clock_timestamp() OR r.generation<>job.generation OR r.phase IN ('PAUSED','CANCELLED','COMPLETE') THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF job.operation='apply' AND NOT EXISTS(SELECT 1 FROM lzc.retirement_jobs saved WHERE saved.id=job.plan_id AND saved.runner_package_id=p_package) THEN
  RAISE EXCEPTION 'retirement_artifact_changed' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET runner_app_id=p_app,runner_package_id=p_package WHERE id=job.id;
END $$;
CREATE FUNCTION lzc_auth.retirement_claim_input(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() FOR UPDATE;
 IF job.id IS NULL THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.retirement_authorize(job.issuer_session_id);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=job.retirement_id;
 IF job.status<>'starting' OR job.input_claimed_at IS NOT NULL OR job.runner_app_id IS NULL OR job.expires_at<=clock_timestamp() OR r.generation<>job.generation OR r.phase IN ('PAUSED','CANCELLED','COMPLETE') THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET input_claimed_at=clock_timestamp(),status='initializing' WHERE id=job.id;
END $$;
CREATE FUNCTION lzc_auth.retirement_assert_release(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id();
 IF job.id IS NULL THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.retirement_authorize(job.issuer_session_id);
 IF job.status<>'initializing' OR job.input_claimed_at IS NULL OR job.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=job.retirement_id AND r.generation=job.generation AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE')) THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION lzc_auth.retirement_stage(p_job uuid,p_stage text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() FOR UPDATE;
 IF job.id IS NULL OR job.input_claimed_at IS NULL OR job.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=job.retirement_id AND r.generation=job.generation AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE')) THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF NOT ((p_stage='initializing' AND job.status='initializing') OR (p_stage='validating' AND job.status='initializing') OR
  (p_stage='planning' AND job.status='validating' AND job.operation='plan') OR (p_stage='applying' AND job.status='validating' AND job.operation='apply')) THEN
  RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET status=p_stage WHERE id=job.id;
END $$;
CREATE FUNCTION lzc_auth.retirement_save_artifact(p_job uuid,p_cipher bytea,p_sha text,p_projection jsonb,p_plan_sha text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() FOR UPDATE;
 IF job.id IS NULL OR job.operation<>'plan' OR job.status<>'planning' OR job.input_claimed_at IS NULL OR job.artifact_ciphertext IS NOT NULL OR job.expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=job.retirement_id AND r.generation=job.generation AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE'))
  OR NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.id=job.scope_id AND scope.state_version=job.state_version AND scope.lock_run_id IS NULL) THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET artifact_ciphertext=p_cipher,artifact_sha256=p_sha,projection=p_projection,plan_sha256=p_plan_sha WHERE id=job.id;
END $$;
CREATE FUNCTION lzc_auth.retirement_store_result(p_job uuid,p_status text,p_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() FOR UPDATE;
 IF job.id IS NULL OR job.native_status IS NOT NULL OR (job.stopped_at IS NOT NULL AND job.status IN ('succeeded','failed')) OR p_status NOT IN ('succeeded','failed') THEN RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
 IF p_status='succeeded' AND NOT ((job.status='planning' AND job.operation='plan' AND job.artifact_ciphertext IS NOT NULL) OR (job.status='applying' AND job.operation='apply')) THEN
  RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET native_status=p_status,result=p_result,status=CASE WHEN job.input_claimed_at IS NULL AND p_status='failed' THEN 'failed' ELSE 'recovery_required' END,finished_at=clock_timestamp() WHERE id=job.id;
 IF p_status='failed' THEN UPDATE lzc.platform_retirements SET phase='NEEDS_ATTENTION' WHERE id=job.retirement_id AND phase<>'PAUSED'; END IF;
END $$;
CREATE FUNCTION lzc_auth.retirement_store_recovery(p_job uuid,p_state bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE lzc.retirement_jobs SET recovery_ciphertext=p_state WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() AND operation='apply' AND input_claimed_at IS NOT NULL AND recovery_ciphertext IS NULL AND native_status IS DISTINCT FROM 'succeeded' AND stopped_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION lzc_auth.retirement_state_action(p_job uuid,p_action text,p_lock text DEFAULT NULL,p_state bytea DEFAULT NULL,p_sha text DEFAULT NULL,p_expected_sha text DEFAULT NULL) RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; scope lzc.retirement_execution_scopes;
BEGIN
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id();
 IF job.id IS NULL OR job.input_claimed_at IS NULL OR job.stopped_at IS NOT NULL OR job.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO scope FROM lzc.retirement_execution_scopes WHERE id=job.scope_id FOR UPDATE;
 IF p_action='read' THEN RETURN scope.current_state_ciphertext;
 ELSIF p_action='lock' THEN
  IF job.status NOT IN ('initializing','validating','planning','applying') OR scope.lock_run_id IS NOT NULL OR scope.state_version<>job.state_version OR NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=job.retirement_id AND r.generation=job.generation AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE')) OR p_lock IS NULL OR length(p_lock)>128 THEN
   RAISE EXCEPTION 'retirement_state_locked' USING ERRCODE='40001'; END IF;
  UPDATE lzc.retirement_execution_scopes SET lock_run_id=job.id,lock_id=p_lock WHERE id=scope.id;
 ELSIF p_action='unlock' THEN
  IF scope.lock_run_id IS DISTINCT FROM job.id OR scope.lock_id IS DISTINCT FROM p_lock THEN RAISE EXCEPTION 'retirement_state_locked' USING ERRCODE='40001'; END IF;
  UPDATE lzc.retirement_execution_scopes SET lock_run_id=NULL,lock_id=NULL WHERE id=scope.id;
 ELSIF p_action='write' THEN
  IF job.operation<>'apply' OR job.status NOT IN ('applying','recovery_required') OR scope.lock_run_id IS DISTINCT FROM job.id OR scope.lock_id IS DISTINCT FROM p_lock OR p_state IS NULL OR p_sha IS NULL OR scope.current_state_sha256 IS DISTINCT FROM p_expected_sha THEN
   RAISE EXCEPTION 'retirement_state_locked' USING ERRCODE='40001'; END IF;
  UPDATE lzc.retirement_execution_scopes SET current_state_ciphertext=p_state,current_state_sha256=p_sha,state_version=state_version+1 WHERE id=scope.id;
 ELSE RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION lzc_auth.retirement_confirm_stopped(p_session uuid,p_job uuid,p_app uuid,p_package uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF job.id IS NULL OR job.runner_app_id IS DISTINCT FROM p_app OR job.runner_package_id IS DISTINCT FROM p_package THEN
  RAISE EXCEPTION 'retirement_runner_not_stopped' USING ERRCODE='40001'; END IF;
 IF job.stopped_at IS NOT NULL THEN RETURN; END IF;
 UPDATE lzc.retirement_jobs SET stopped_at=coalesce(stopped_at,clock_timestamp()),stopped_stage=coalesce(stopped_stage,status),status=CASE WHEN native_status IS NULL THEN 'recovery_required' ELSE status END WHERE id=job.id;
 -- Revoke only this proven-stopped job's application-owned HTTP lease.
 UPDATE lzc.retirement_execution_scopes SET lock_run_id=NULL,lock_id=NULL WHERE id=job.scope_id AND lock_run_id=job.id;
END $$;
CREATE FUNCTION lzc_auth.retirement_close_job(p_session uuid,p_job uuid,p_next_stage text DEFAULT NULL,p_waiting boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; scope lzc.retirement_execution_scopes; r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 SELECT * INTO scope FROM lzc.retirement_execution_scopes WHERE id=job.scope_id FOR UPDATE;
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=job.retirement_id FOR UPDATE;
 IF job.id IS NULL OR job.stopped_at IS NULL OR job.status<>'recovery_required' OR job.native_status IS NULL OR job.recovery_ciphertext IS NOT NULL OR scope.lock_run_id IS NOT NULL THEN
  RAISE EXCEPTION 'retirement_reconciliation_required' USING ERRCODE='40001'; END IF;
 IF p_next_stage IS NOT NULL THEN
  IF job.operation<>'apply' OR job.native_status<>'succeeded' OR scope.stage<>job.phase OR NOT (
   (job.phase='private_workloads' AND p_next_stage='remove_projects') OR
   (job.phase='remove_projects' AND p_next_stage='finalize_folders') OR
   (job.phase IN ('remove_application','finalize_folders') AND p_next_stage='complete')) THEN
   RAISE EXCEPTION 'retirement_runner_transition_invalid' USING ERRCODE='40001'; END IF;
  UPDATE lzc.retirement_execution_scopes SET stage=p_next_stage WHERE id=scope.id;
  IF scope.instance_id IS NOT NULL AND p_next_stage='complete' THEN
   INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by) VALUES(scope.instance_id,r.tenant_id,lzc.current_user_id()) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF job.operation='apply' AND NOT (job.native_status='failed' AND job.result->>'stateSha256' IS NOT NULL AND (NOT p_waiting OR (job.phase='finalize_folders' AND job.result->>'errorCode'='retirement_folder_purge_pending'))) THEN
  RAISE EXCEPTION 'retirement_reconciliation_required' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_jobs SET status=job.native_status WHERE id=job.id;
 IF r.phase<>'PAUSED' THEN
  UPDATE lzc.platform_retirements SET phase=CASE
   WHEN NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes child WHERE child.retirement_id=r.id AND child.stage<>'complete') THEN 'COMPLETE'
   WHEN p_waiting OR p_next_stage='finalize_folders' THEN 'WAITING_FOR_PURGE'
   WHEN job.native_status='failed' THEN 'NEEDS_ATTENTION'
   ELSE 'PREPARED' END WHERE id=r.id;
 END IF;
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(r.id,lzc.current_user_id(),job.generation,'job-closed:'||job.phase||':'||job.native_status);
END $$;
CREATE FUNCTION lzc_auth.retirement_job_for_review(p_session uuid,p_id uuid,p_job uuid) RETURNS lzc.retirement_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result lzc.retirement_jobs;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT job.* INTO result FROM lzc.retirement_jobs job WHERE job.retirement_id=p_id AND job.id=p_job AND job.tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_execution_review(p_session uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; prepared boolean; idle boolean;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 prepared:=EXISTS(SELECT 1 FROM lzc.retirement_control_grants grant_row WHERE grant_row.retirement_id=r.id AND grant_row.generation=r.generation AND grant_row.operator_id=lzc.current_user_id());
 idle:=NOT EXISTS(SELECT 1 FROM lzc.retirement_jobs job WHERE job.retirement_id=r.id AND (job.status IN ('starting','initializing','validating','planning','applying','recovery_required') OR (job.input_claimed_at IS NOT NULL AND job.stopped_at IS NULL)));
 RETURN jsonb_build_object('retirementId',r.id,'generation',r.generation,'hasHandoff',EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.retirement_id=r.id),
  'prepared',prepared,'canPrepare',r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE') AND clock_timestamp()>=r.not_before AND idle,
  'scopes',coalesce((SELECT jsonb_agg(item ORDER BY item->>'instanceId' NULLS LAST,item->>'name') FROM (
    SELECT jsonb_build_object('id',scope.id,'name',CASE WHEN scope.instance_id IS NULL THEN r.name ELSE coalesce((SELECT item->>'name' FROM jsonb_array_elements(r.applications) item WHERE item->>'id'=scope.instance_id::text),'Application') END,
     'instanceId',scope.instance_id,'stage',scope.stage,'stateVersion',scope.state_version::text,
     'canPlan',prepared AND idle AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE') AND scope.stage<>'complete' AND (scope.instance_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes child WHERE child.retirement_id=r.id AND child.instance_id IS NOT NULL AND child.stage<>'complete'))) AS item
    FROM lzc.retirement_execution_scopes scope WHERE scope.retirement_id=r.id) scopes),'[]'),
  'jobs',coalesce((SELECT jsonb_agg(item ORDER BY item->>'createdAt' DESC) FROM (
    SELECT jsonb_build_object('id',job.id,'scopeId',job.scope_id,'operatorId',job.operator_id,'generation',job.generation,'operation',job.operation,'phase',job.phase,'status',job.status,'nativeStatus',job.native_status,
     'createdAt',job.created_at,'sourceRevision',job.source_revision,'providerLockSha256',job.provider_lock_sha256,'artifactSha256',job.artifact_sha256,
     'deleteCount',(SELECT count(*) FROM jsonb_array_elements(coalesce(job.projection->'resource_changes','[]')) resource WHERE resource#>'{change,actions}'='["delete"]'::jsonb),
     'canApply',prepared AND idle AND job.operator_id=lzc.current_user_id() AND job.operation='plan' AND job.status='succeeded' AND job.native_status='succeeded' AND job.stopped_at IS NOT NULL AND job.artifact_ciphertext IS NOT NULL AND job.generation=r.generation
      AND job.created_at>clock_timestamp()-interval '30 minutes' AND r.phase NOT IN ('PAUSED','CANCELLED','COMPLETE')
      AND EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.id=job.scope_id AND scope.stage=job.phase AND scope.state_version=job.state_version AND scope.lock_run_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM lzc.retirement_jobs used WHERE used.plan_id=job.id),
     'canInspect',job.status='recovery_required' OR (job.runner_app_id IS NOT NULL AND job.status IN ('starting','initializing','validating','planning','applying')),
     'recoveryAvailable',job.recovery_ciphertext IS NOT NULL,'recoveryPending',coalesce((job.result->>'recoveryRequired')::boolean,false) AND job.recovery_ciphertext IS NULL,
     'errorCode',job.result->>'errorCode') AS item FROM (SELECT * FROM lzc.retirement_jobs current_job WHERE current_job.retirement_id=r.id ORDER BY current_job.created_at DESC LIMIT 20) job) jobs),'[]'));
END $$;
CREATE FUNCTION lzc_auth.retirement_dispatch_failed(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE lzc.retirement_jobs SET status='failed',result=jsonb_build_object('errorCode','retirement_runner_unavailable'),finished_at=clock_timestamp()
 WHERE id=p_job AND tenant_id=lzc.current_tenant_id() AND operator_id=lzc.current_user_id() AND input_claimed_at IS NULL AND status='starting';
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lzc_auth' AND p.proname IN
  ('retirement_scope_context','retirement_start_job','resolve_retirement_ticket','retirement_runner_context','retirement_record_dispatch','retirement_claim_input','retirement_assert_release','retirement_stage','retirement_save_artifact','retirement_store_result','retirement_store_recovery','retirement_state_action','retirement_confirm_stopped','retirement_close_job','retirement_job_for_review','retirement_execution_review','retirement_dispatch_failed') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO configurator_app',f.signature);
 END LOOP;
END $$;

-- Distinguish these new jobs from orphaned legacy runner apps. Never sweep an
-- unresolved writer or the only interrupted-State upload before reconciliation.
ALTER FUNCTION lzc_auth.runner_cleanup_disposition(uuid,uuid,text) RENAME TO runner_cleanup_disposition_before_retirement;
REVOKE ALL ON FUNCTION lzc_auth.runner_cleanup_disposition_before_retirement(uuid,uuid,text) FROM configurator_app;
CREATE FUNCTION lzc_auth.runner_cleanup_disposition(p_runner uuid,p_app uuid,p_kind text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs;
BEGIN
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_runner OR runner_app_id=p_app LIMIT 1;
 IF FOUND THEN
  RETURN CASE WHEN p_kind='plan' AND job.id=p_runner AND job.runner_app_id=p_app AND job.stopped_at IS NOT NULL
   AND job.status IN ('succeeded','failed') AND job.expires_at<clock_timestamp()
   AND NOT(coalesce((job.result->>'recoveryRequired')::boolean,false) AND job.recovery_ciphertext IS NULL)
  THEN 'completed' ELSE 'protected' END;
 END IF;
 RETURN lzc_auth.runner_cleanup_disposition_before_retirement(p_runner,p_app,p_kind);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.runner_cleanup_disposition(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.runner_cleanup_disposition(uuid,uuid,text) TO configurator_app;

CREATE FUNCTION lzc_auth.retirement_reschedule(p_session uuid,p_id uuid,p_generation bigint,p_not_before timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; recipient uuid;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase NOT IN ('RETIRING','DRAINING','PREPARED') OR r.destructive_started_at IS NOT NULL OR EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes WHERE retirement_id=r.id) THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF p_not_before IS NULL OR p_not_before<clock_timestamp() THEN RAISE EXCEPTION 'retirement_invalid_schedule' USING ERRCODE='40001'; END IF;
 UPDATE lzc.platform_retirements SET not_before=p_not_before,generation=generation+1,phase='RETIRING',invalidated_at=clock_timestamp() WHERE id=r.id;
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(r.id,lzc.current_user_id(),r.generation+1,'rescheduled');
 FOR recipient IN SELECT DISTINCT (item->>'requestedBy')::uuid FROM jsonb_array_elements(r.applications) item LOOP
  PERFORM lzc_auth.enqueue_notification(r.tenant_id,recipient,r.id::text||':rescheduled:'||(r.generation+1)::text,'retirement','retirement-announced','retirement',r.id);
 END LOOP;
 RETURN lzc_auth.retirement_view(r.id);
END $$;
CREATE FUNCTION lzc_auth.retirement_adopt_recovery(p_session uuid,p_job uuid,p_generation bigint,p_version bigint,p_recovery_sha text,p_state bytea,p_state_sha text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; scope lzc.retirement_execution_scopes; r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=job.retirement_id FOR UPDATE;
 SELECT * INTO scope FROM lzc.retirement_execution_scopes WHERE id=job.scope_id FOR UPDATE;
 IF job.id IS NULL OR r.generation<>p_generation OR r.phase IN ('CANCELLED','COMPLETE') OR job.stopped_at IS NULL OR job.native_status='succeeded'
  OR job.status<>'recovery_required' OR job.recovery_ciphertext IS NULL OR job.recovery_adopted_at IS NOT NULL OR scope.lock_run_id IS NOT NULL OR scope.state_version<>p_version THEN
  RAISE EXCEPTION 'retirement_reconciliation_required' USING ERRCODE='40001'; END IF;
 UPDATE lzc.retirement_execution_scopes SET current_state_ciphertext=p_state,current_state_sha256=p_state_sha,state_version=state_version+1 WHERE id=scope.id;
 -- The interrupted native Apply remains failed. Adoption permits only a new Plan.
 UPDATE lzc.retirement_jobs SET status='failed',recovery_adopted_at=clock_timestamp() WHERE id=job.id;
 UPDATE lzc.platform_retirements SET phase='NEEDS_ATTENTION' WHERE id=r.id AND phase<>'PAUSED';
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(r.id,lzc.current_user_id(),r.generation,'recovery-state-adopted:'||job.id::text||':'||p_recovery_sha);
END $$;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('lzc_auth.retirement_change(uuid,uuid,bigint,text)'::regprocedure);
 IF strpos(definition,'next_phase:=r.resume_phase;')=0 THEN RAISE EXCEPTION 'retirement_resume_anchor_missing'; END IF;
 definition:=replace(definition,'next_phase:=r.resume_phase;',
  'next_phase:=CASE WHEN EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes WHERE retirement_id=r.id) AND NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes WHERE retirement_id=r.id AND stage<>''complete'') THEN ''COMPLETE'' ELSE r.resume_phase END;');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_reschedule(uuid,uuid,bigint,timestamptz),lzc_auth.retirement_adopt_recovery(uuid,uuid,bigint,bigint,text,bytea,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_reschedule(uuid,uuid,bigint,timestamptz),lzc_auth.retirement_adopt_recovery(uuid,uuid,bigint,bigint,text,bytea,text) TO configurator_app;

ALTER TABLE lzc_auth.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE lzc_auth.notifications ADD CHECK(kind IN ('invitation','invitation-expiring','order-pending','order-approved','order-rejected','execution-succeeded','execution-failed','execution-cancelled','recovery-required','access-changed','action-overdue','upgrade-approved','retirement-announced','retirement-cancelled','retirement-completed'));
CREATE FUNCTION lzc.retirement_terminal_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE recipient uuid; kind text;
BEGIN
 kind:=CASE WHEN NEW.phase='COMPLETE' THEN 'retirement-completed' ELSE 'retirement-cancelled' END;
 FOR recipient IN SELECT DISTINCT (item->>'requestedBy')::uuid FROM jsonb_array_elements(NEW.applications) item UNION SELECT NEW.created_by LOOP
  PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,recipient,NEW.id::text||':'||kind,'retirement',kind,'retirement',NEW.id);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER retirement_terminal_notice AFTER UPDATE OF phase ON lzc.platform_retirements FOR EACH ROW WHEN(NEW.phase IN ('CANCELLED','COMPLETE') AND OLD.phase IS DISTINCT FROM NEW.phase) EXECUTE FUNCTION lzc.retirement_terminal_notice();
REVOKE ALL ON FUNCTION lzc.retirement_terminal_notice() FROM PUBLIC;

DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('lzc_auth.retirement_view(uuid)'::regprocedure);
 IF strpos(definition,$anchor$'createdBy',r.created_by,$anchor$)=0 THEN RAISE EXCEPTION 'retirement_view_cancel_anchor_missing'; END IF;
 definition:=replace(definition,$anchor$'createdBy',r.created_by,$anchor$, $replacement$'createdBy',r.created_by,'canCancel',r.phase NOT IN ('COMPLETE','CANCELLED') AND r.destructive_started_at IS NULL AND NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.retirement_id=r.id) AND jsonb_array_length(lzc_auth.retirement_blockers(r.id)-'retirement-preparation-window')=0,$replacement$);
 EXECUTE definition;
END $$;

CREATE FUNCTION lzc_auth.retirement_close_inert_job(p_session uuid,p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.retirement_jobs; scope lzc.retirement_execution_scopes;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.retirement_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 SELECT * INTO scope FROM lzc.retirement_execution_scopes WHERE id=job.scope_id FOR UPDATE;
 IF job.id IS NULL OR job.stopped_at IS NULL OR job.native_status IS NOT NULL OR job.recovery_ciphertext IS NOT NULL OR job.status<>'recovery_required'
  OR scope.state_version<>job.state_version OR scope.lock_run_id IS NOT NULL OR NOT(job.operation='plan' OR job.stopped_stage IN ('starting','initializing','validating')) THEN
  RAISE EXCEPTION 'retirement_reconciliation_required' USING ERRCODE='40001'; END IF;
 -- No successful native result is invented. A stopped Plan cannot write State;
 -- an Apply stopped before the applying stage never received write authority.
 UPDATE lzc.retirement_jobs SET status='failed',finished_at=coalesce(finished_at,clock_timestamp()),result=jsonb_build_object('errorCode',CASE WHEN operation='plan' THEN 'retirement_plan_outcome_unconfirmed' ELSE 'retirement_runner_stopped_before_apply' END) WHERE id=job.id;
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(job.retirement_id,lzc.current_user_id(),job.generation,'stopped-without-native-execution-proof:'||job.id::text);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_close_inert_job(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_close_inert_job(uuid,uuid) TO configurator_app;
