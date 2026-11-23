-- State authority may outlive the Management project that originally hosted S3.
-- Transfer is explicit, encrypted and irreversible through the ordinary Cancel action.
CREATE TABLE lzc.retirement_execution_scopes (
 id uuid PRIMARY KEY,
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 inventory_id uuid NOT NULL REFERENCES lzc.retirement_inventories(id),
 scope_key text NOT NULL, instance_id uuid REFERENCES lzc.application_instances(id),
 requested_by uuid REFERENCES lzc_auth.users(id),
 stage text NOT NULL CHECK(stage IN ('private_workloads','remove_application','remove_projects','finalize_folders','complete')),
 current_state_ciphertext bytea NOT NULL CHECK(octet_length(current_state_ciphertext) BETWEEN 29 AND 16777244),
 current_state_sha256 text NOT NULL CHECK(current_state_sha256 ~ '^[0-9a-f]{64}$'),
 state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>0),
 lock_run_id uuid, lock_id text, CHECK((lock_run_id IS NULL)=(lock_id IS NULL)),
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(retirement_id,scope_key)
);
CREATE TABLE lzc.retirement_control_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 generation bigint NOT NULL CHECK(generation>0), operator_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer_session_id uuid NOT NULL, credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL CHECK(credential_version>0), credential_key_id text NOT NULL,
 cleanup_project_id uuid NOT NULL, witness_ciphertext bytea NOT NULL CHECK(octet_length(witness_ciphertext) BETWEEN 29 AND 1048604),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(retirement_id,generation)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['retirement_execution_scopes','retirement_control_grants'] LOOP
  EXECUTE format('ALTER TABLE lzc.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE lzc.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY retirement_handoff_migration ON lzc.%I TO configurator_migration USING(true) WITH CHECK(true)',tab);
 END LOOP;
END $$;
CREATE TRIGGER retirement_control_grant_immutable BEFORE UPDATE OR DELETE ON lzc.retirement_control_grants
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
CREATE TABLE lzc.retirement_writer_stops (
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id), job_id uuid NOT NULL REFERENCES lzc.application_jobs(id),
 app_id uuid NOT NULL, package_id uuid NOT NULL, checked_by uuid NOT NULL REFERENCES lzc_auth.users(id), checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(retirement_id,job_id)
);
ALTER TABLE lzc.retirement_writer_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.retirement_writer_stops FORCE ROW LEVEL SECURITY;
CREATE POLICY retirement_stops_migration ON lzc.retirement_writer_stops TO configurator_migration USING(true) WITH CHECK(true);
CREATE TRIGGER retirement_stops_immutable BEFORE UPDATE OR DELETE ON lzc.retirement_writer_stops FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
CREATE FUNCTION lzc_auth.retirement_writers(p_session uuid,p_id uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; result jsonb;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase IN ('CANCELLED','COMPLETE','PAUSED') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('jobId',job.id,'appId',dispatch.runner_app_id,'packageId',dispatch.runner_package_id,'status',dispatch.status)),'[]') INTO result
 FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id JOIN jsonb_array_elements(r.applications) item ON item->>'id'=job.instance_id::text
 WHERE EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=job.id AND ticket.consumed_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=job.id AND receipt.app_id=dispatch.runner_app_id)
 AND NOT EXISTS(SELECT 1 FROM lzc.retirement_writer_stops receipt WHERE receipt.retirement_id=r.id AND receipt.job_id=job.id);
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_record_writer_stop(p_session uuid,p_id uuid,p_generation bigint,p_job uuid,p_app uuid,p_package uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND OR r.generation<>p_generation OR r.phase IN ('CANCELLED','COMPLETE','PAUSED') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id JOIN jsonb_array_elements(r.applications) item ON item->>'id'=job.instance_id::text
  WHERE job.id=p_job AND dispatch.runner_app_id=p_app AND dispatch.runner_package_id=p_package AND dispatch.status IN ('succeeded','failed','cancelled','reconciliation_required')) THEN
  RAISE EXCEPTION 'retirement_writer_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO lzc.retirement_writer_stops(retirement_id,job_id,app_id,package_id,checked_by) VALUES(p_id,p_job,p_app,p_package,lzc.current_user_id()) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION lzc_auth.retirement_blockers(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(array_remove(ARRAY[
  CASE WHEN EXISTS(SELECT 1 FROM lzc.plan_runs run WHERE run.state_key=r.state_key AND (
   run.status IN ('starting','initializing','validating','planning','applying','recovery_required') OR
   (run.input_claimed AND NOT run.cleaned AND run.status IN ('failed','cancelled') AND
    NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=run.id AND receipt.app_id=run.runner_app_id) AND
    NOT EXISTS(SELECT 1 FROM lzc.platform_reconciliations receipt WHERE receipt.run_id=run.id))))
   OR EXISTS(SELECT 1 FROM lzc.platform_states state WHERE state.state_key=r.state_key AND state.lock_run_id IS NOT NULL)
   THEN 'retirement-platform-writer-unresolved' END,
  CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.applications) item
   WHERE jsonb_array_length(lzc_auth.application_execution_blockers((item->>'id')::uuid))>0)
   OR EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id
    JOIN jsonb_array_elements(r.applications) item ON item->>'id'=job.instance_id::text
    WHERE EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=job.id AND ticket.consumed_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=job.id AND receipt.app_id=dispatch.runner_app_id)
    AND NOT EXISTS(SELECT 1 FROM lzc.retirement_writer_stops receipt WHERE receipt.retirement_id=r.id AND receipt.job_id=job.id))
   THEN 'retirement-application-writer-unresolved' END,
  CASE WHEN clock_timestamp()<r.not_before THEN 'retirement-preparation-window' END
 ],NULL)) FROM lzc.platform_retirements r WHERE r.id=p_id;
$$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_writers(uuid,uuid,bigint),lzc_auth.retirement_record_writer_stop(uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_writers(uuid,uuid,bigint),lzc_auth.retirement_record_writer_stop(uuid,uuid,bigint,uuid,uuid,uuid) TO configurator_app;
CREATE FUNCTION lzc_auth.retirement_read_inventories(p_session uuid,p_id uuid,p_generation bigint) RETURNS SETOF lzc.retirement_inventories
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase IN ('CANCELLED','COMPLETE','PAUSED') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 RETURN QUERY SELECT i.* FROM lzc.retirement_inventories i WHERE i.retirement_id=p_id AND
  (i.generation=p_generation OR EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.inventory_id=i.id)) ORDER BY i.scope_key;
END $$;
CREATE FUNCTION lzc_auth.retirement_execution_context(p_session uuid,p_id uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; result jsonb;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase IN ('CANCELLED','COMPLETE','PAUSED') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'scopeKey',s.scope_key,'instanceId',s.instance_id,'requestedBy',s.requested_by,
  'inventoryId',s.inventory_id,'stage',s.stage,'stateCiphertext',encode(s.current_state_ciphertext,'base64'),'stateSha256',s.current_state_sha256,
  'stateVersion',s.state_version,'lockRunId',s.lock_run_id) ORDER BY s.scope_key),'[]') INTO result
 FROM lzc.retirement_execution_scopes s WHERE s.retirement_id=p_id;
 RETURN jsonb_build_object('retirementId',r.id,'generation',r.generation,'organizationId',r.organization_id,'phase',r.phase,'notBefore',r.not_before,'parentFolderIds',coalesce((SELECT jsonb_agg(identity) FROM lzc.retirement_scopes WHERE retirement_id=r.id AND kind='parent'),'[]'),'scopes',result);
END $$;
CREATE FUNCTION lzc_auth.retirement_prepare_control(p_session uuid,p_id uuid,p_generation bigint,p_profile uuid,p_version integer,p_kid text,
 p_cleanup_project uuid,p_witness bytea,p_scopes jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; scope jsonb; item lzc.retirement_inventories; context_sha text; expected integer; entry uuid; existing lzc.retirement_control_grants;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session); PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase NOT IN ('RETIRING','DRAINING','PREPARED','TEARING_DOWN','WAITING_FOR_PURGE','FINALIZING','NEEDS_ATTENTION') THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(lzc_auth.retirement_blockers(r.id))>0 THEN RAISE EXCEPTION 'retirement_writers_unresolved' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.credential_profiles profile WHERE profile.id=p_profile AND profile.tenant_id=r.tenant_id
  AND profile.owner_user_id=lzc.current_user_id() AND profile.state='stored' AND profile.key_id=p_kid) THEN
  RAISE EXCEPTION 'retirement_cleanup_identity_unverified' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM lzc.retirement_control_grants WHERE retirement_id=p_id AND generation=p_generation;
 IF FOUND THEN
  IF existing.operator_id<>lzc.current_user_id() OR existing.credential_profile_id<>p_profile OR existing.credential_version<>p_version OR existing.credential_key_id<>p_kid OR existing.cleanup_project_id<>p_cleanup_project THEN
   RAISE EXCEPTION 'retirement_control_grant_changed' USING ERRCODE='40001'; END IF;
  RETURN existing.id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes WHERE retirement_id=p_id) THEN
  context_sha:=lzc_auth.retirement_capture_digest(p_session,p_id,p_generation);
  SELECT count(*) INTO expected FROM lzc.retirement_inventories WHERE retirement_id=p_id AND generation=p_generation AND context_sha256=context_sha;
  IF expected=0 OR expected<>jsonb_array_length(p_scopes) OR expected<>(SELECT jsonb_array_length(value->'applications')+1 FROM (SELECT lzc_auth.retirement_capture_context(p_session,p_id,p_generation) AS value) snapshot) THEN
   RAISE EXCEPTION 'retirement_inventory_incomplete' USING ERRCODE='40001'; END IF;
  FOR scope IN SELECT * FROM jsonb_array_elements(p_scopes) LOOP
   SELECT * INTO item FROM lzc.retirement_inventories WHERE id=(scope->>'inventoryId')::uuid AND retirement_id=p_id AND generation=p_generation AND context_sha256=context_sha;
   IF NOT FOUND THEN RAISE EXCEPTION 'retirement_inventory_changed' USING ERRCODE='40001'; END IF;
   INSERT INTO lzc.retirement_execution_scopes(id,retirement_id,inventory_id,scope_key,instance_id,requested_by,stage,current_state_ciphertext,current_state_sha256,created_by)
   VALUES((scope->>'id')::uuid,p_id,item.id,item.scope_key,item.instance_id,item.requested_by,scope->>'stage',decode(scope->>'stateCiphertext','base64'),scope->>'stateSha256',lzc.current_user_id());
  END LOOP;
 ELSIF jsonb_array_length(p_scopes)<>0 THEN RAISE EXCEPTION 'retirement_control_handoff_committed' USING ERRCODE='40001'; END IF;
 INSERT INTO lzc.retirement_control_grants(retirement_id,generation,operator_id,issuer_session_id,credential_profile_id,credential_version,credential_key_id,cleanup_project_id,witness_ciphertext)
 VALUES(p_id,p_generation,lzc.current_user_id(),p_session,p_profile,p_version,p_kid,p_cleanup_project,p_witness) RETURNING id INTO entry;
 UPDATE lzc.platform_retirements SET phase='PREPARED' WHERE id=p_id AND phase IN ('RETIRING','DRAINING');
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(p_id,lzc.current_user_id(),p_generation,'control-prepared');
 RETURN entry;
END $$;
CREATE FUNCTION lzc.guard_retirement_handoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE instance uuid; retirement uuid;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 IF TG_TABLE_NAME='platform_retirements' THEN
  IF EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.retirement_id=OLD.id) THEN
   RAISE EXCEPTION 'retirement_control_handoff_committed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='application_jobs' THEN instance:=NEW.instance_id;
 ELSIF TG_TABLE_NAME='application_state_recoveries' THEN instance:=NEW.instance_id;
 ELSIF TG_TABLE_NAME='application_state_recovery_tasks' THEN SELECT r.instance_id INTO instance FROM lzc.application_state_recoveries r WHERE r.id=NEW.recovery_id;
 ELSE SELECT job.instance_id INTO instance FROM lzc.application_jobs job WHERE job.id=NEW.job_id; END IF;
 SELECT r.id INTO retirement FROM lzc.platform_retirements r JOIN jsonb_array_elements(r.applications) item ON item->>'id'=instance::text
 WHERE EXISTS(SELECT 1 FROM lzc.retirement_execution_scopes scope WHERE scope.retirement_id=r.id);
 IF retirement IS NOT NULL THEN RAISE EXCEPTION 'retirement_control_handoff_committed' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retirement_handoff_cancel BEFORE UPDATE OF phase ON lzc.platform_retirements FOR EACH ROW WHEN(NEW.phase='CANCELLED' AND OLD.phase<>'CANCELLED') EXECUTE FUNCTION lzc.guard_retirement_handoff();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['application_jobs','application_runner_tickets','application_job_claims','application_job_backends','application_dispatches','application_state_recoveries','application_state_recovery_tasks'] LOOP
  EXECUTE format('CREATE TRIGGER a_retirement_handoff BEFORE INSERT ON lzc.%I FOR EACH ROW EXECUTE FUNCTION lzc.guard_retirement_handoff()',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_retirement_handoff(),lzc_auth.retirement_read_inventories(uuid,uuid,bigint),lzc_auth.retirement_execution_context(uuid,uuid,bigint),lzc_auth.retirement_prepare_control(uuid,uuid,bigint,uuid,integer,text,uuid,bytea,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_read_inventories(uuid,uuid,bigint),lzc_auth.retirement_execution_context(uuid,uuid,bigint),lzc_auth.retirement_prepare_control(uuid,uuid,bigint,uuid,integer,text,uuid,bytea,jsonb) TO configurator_app;
