-- Durable intent survives the resources being removed; runtime has no table mutation grant.
CREATE TABLE lzc.platform_retirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 -- Validated by retirement_start; do not FK-lock a State row held by a Plan
 -- that is still waiting for its final admission fence. The immutable key must
 -- also survive later State-record archival for audit and deferred cleanup.
 state_key text NOT NULL, organization_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES lzc_auth.users(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 256), reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 phase text NOT NULL DEFAULT 'RETIRING' CHECK(phase IN ('RETIRING','DRAINING','PREPARED','TEARING_DOWN','WAITING_FOR_PURGE','FINALIZING','COMPLETE','PAUSED','NEEDS_ATTENTION','CANCELLED')),
 resume_phase text, generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 not_before timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 invalidated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 applications jsonb NOT NULL CHECK(jsonb_typeof(applications)='array'),
 destructive_started_at timestamptz
);
CREATE UNIQUE INDEX retirement_one_live_state ON lzc.platform_retirements(state_key) WHERE phase<>'CANCELLED';
CREATE TABLE lzc.retirement_scopes (
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 kind text NOT NULL CHECK(kind IN ('revision','parent')), identity text NOT NULL,
 PRIMARY KEY(retirement_id,kind,identity)
);
CREATE TABLE lzc.retirement_job_generations (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_jobs(id),
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id), generation bigint NOT NULL
);
CREATE TABLE lzc.retirement_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 actor_id uuid NOT NULL REFERENCES lzc_auth.users(id), generation bigint NOT NULL,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['platform_retirements','retirement_scopes','retirement_job_generations','retirement_events'] LOOP
  EXECUTE format('ALTER TABLE lzc.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE lzc.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY retirement_migration ON lzc.%I TO configurator_migration USING(true) WITH CHECK(true)',tab);
 END LOOP;
END $$;

CREATE FUNCTION lzc_auth.retirement_lock() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pg_advisory_xact_lock(hashtextextended('lzc:retirement-admission',0));
$$;
CREATE FUNCTION lzc_auth.retirement_contract(p_revision uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT r.id FROM lzc.platform_retirements r WHERE r.phase<>'CANCELLED' AND (
  EXISTS(SELECT 1 FROM lzc.retirement_scopes s WHERE s.retirement_id=r.id AND s.kind='revision' AND s.identity=p_revision::text)
  OR EXISTS(SELECT 1 FROM lzc.application_platform_sources s WHERE s.revision=p_revision AND s.state_key=r.state_key)
  OR EXISTS(SELECT 1 FROM lzc.application_platform_contracts c CROSS JOIN LATERAL jsonb_each(c.document->'targets') target
   JOIN lzc.retirement_scopes scope ON scope.kind='parent' AND scope.identity=target.value->>'folder_id'
   WHERE c.revision=p_revision AND scope.retirement_id=r.id)
 ) ORDER BY r.created_at DESC LIMIT 1;
$$;
CREATE FUNCTION lzc_auth.retirement_authorize(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF NOT EXISTS(SELECT 1 FROM lzc.tenants t JOIN lzc.stackit_organization_access a ON a.tenant_id=t.id
  JOIN lzc.stackit_identities i ON i.user_id=a.user_id
  WHERE t.id=lzc.current_tenant_id() AND t.organization_verified AND t.archived_at IS NULL
   AND a.user_id=lzc.current_user_id() AND a.organization_id=t.organization_id
   AND a.valid_until>now() AND i.revoked_at IS NULL AND i.valid_until>now() AND a.verified_at>=i.verified_at)
 THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION lzc_auth.retirement_blockers(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(array_remove(ARRAY[
  CASE WHEN EXISTS(SELECT 1 FROM lzc.plan_runs run WHERE run.state_key=r.state_key AND (
   run.status IN ('starting','initializing','validating','planning','applying','recovery_required') OR
   (run.input_claimed AND NOT run.cleaned AND run.status IN ('failed','cancelled') AND
    NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=run.id AND receipt.app_id=run.runner_app_id) AND
    NOT EXISTS(SELECT 1 FROM lzc.platform_reconciliations receipt WHERE receipt.run_id=run.id))))
   OR EXISTS(SELECT 1 FROM lzc.platform_states s WHERE s.state_key=r.state_key AND s.lock_run_id IS NOT NULL)
   THEN 'retirement-platform-writer-unresolved' END,
  CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.applications) item
   WHERE jsonb_array_length(lzc_auth.application_execution_blockers((item->>'id')::uuid))>0)
   THEN 'retirement-application-writer-unresolved' END,
  CASE WHEN clock_timestamp()<r.not_before THEN 'retirement-preparation-window' END
 ],NULL)) FROM lzc.platform_retirements r WHERE r.id=p_id;
$$;
CREATE FUNCTION lzc_auth.retirement_view(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',r.id,'stateKey',CASE WHEN lzc.application_role('platform-engineer') THEN r.state_key ELSE '' END,
  'organizationId',r.organization_id,'name',r.name,'phase',r.phase,'generation',r.generation,'reason',r.reason,
  'notBefore',r.not_before,'createdAt',r.created_at,'createdBy',r.created_by,
  'applications',coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(r.applications) a
   WHERE lzc.application_role('platform-engineer') OR a->>'requestedBy'=lzc.current_user_id()::text),'[]'),
  'blockers',lzc_auth.retirement_blockers(r.id))
 FROM lzc.platform_retirements r WHERE r.id=p_id AND r.tenant_id=lzc.current_tenant_id() AND (
  lzc.application_role('platform-engineer') OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.applications) a WHERE a->>'requestedBy'=lzc.current_user_id()::text));
$$;
CREATE FUNCTION lzc_auth.retirement_list(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT coalesce(jsonb_agg(value),'[]') INTO result FROM (
  SELECT lzc_auth.retirement_view(r.id) value FROM lzc.platform_retirements r WHERE r.tenant_id=lzc.current_tenant_id() ORDER BY r.created_at DESC LIMIT 100
 ) available WHERE value IS NOT NULL;
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_candidates(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT coalesce(jsonb_agg(candidate),'[]') INTO result FROM (
  SELECT jsonb_build_object('stateKey',s.state_key,'name',coalesce((SELECT coalesce(nullif(p.manifest#>>'{configuration,name}',''),nullif(p.manifest#>>'{configuration,draft,name}',''))
   FROM lzc.plan_runs run JOIN lzc.deployment_preparations p ON p.id=run.preparation_id WHERE run.state_key=s.state_key ORDER BY run.created_at DESC LIMIT 1),'Landing Zone'),
   'applicationCount',(SELECT count(*) FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id
     JOIN lzc.application_platform_sources source ON source.revision=v.platform_revision WHERE source.state_key=s.state_key)) AS candidate
  FROM lzc.platform_states s WHERE s.tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_platform_sources source WHERE source.state_key=s.state_key)
   AND NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.state_key=s.state_key AND r.phase<>'CANCELLED')
  ORDER BY s.state_key LIMIT 100
 ) available;
 RETURN result;
END $$;
CREATE FUNCTION lzc_auth.retirement_start(p_session uuid,p_state text,p_reason text,p_not_before timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state lzc.platform_states; organization uuid; entry uuid; apps jsonb; item record; display_name text;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO state FROM lzc.platform_states WHERE state_key=p_state AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_state_unavailable' USING ERRCODE='42501'; END IF;
 SELECT organization_id INTO organization FROM lzc.tenants WHERE id=state.tenant_id;
 IF EXISTS(SELECT 1 FROM lzc.platform_retirements WHERE state_key=p_state AND phase<>'CANCELLED')
 THEN RAISE EXCEPTION 'retirement_already_started' USING ERRCODE='40001'; END IF;
 IF p_not_before IS NOT NULL AND p_not_before<clock_timestamp() THEN RAISE EXCEPTION 'retirement_invalid_schedule' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.application_platform_sources WHERE state_key=p_state AND tenant_id=state.tenant_id)
 THEN RAISE EXCEPTION 'retirement_applied_binding_required' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'requestedBy',i.requested_by) ORDER BY i.id),'[]') INTO apps
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id
 JOIN lzc.application_platform_contracts contract ON contract.revision=lzc_auth.effective_application_platform_revision(i.id)
 WHERE i.tenant_id=state.tenant_id AND (
  EXISTS(SELECT 1 FROM lzc.application_platform_sources source WHERE source.state_key=p_state AND source.revision=contract.revision)
  OR EXISTS(SELECT 1 FROM lzc.application_platform_sources source JOIN lzc.application_platform_contracts original ON original.revision=source.revision
   CROSS JOIN LATERAL jsonb_each(original.document->'targets') old_target CROSS JOIN LATERAL jsonb_each(contract.document->'targets') target
   WHERE source.state_key=p_state AND old_target.value->>'folder_id'=target.value->>'folder_id')
 );
 IF EXISTS(SELECT 1 FROM lzc.application_platform_sources own_source
  JOIN lzc.application_platform_contracts own_contract ON own_contract.revision=own_source.revision
  CROSS JOIN LATERAL jsonb_each(own_contract.document->'targets') own_target
  JOIN lzc.application_platform_contracts other_contract ON other_contract.revision<>own_contract.revision
  CROSS JOIN LATERAL jsonb_each(other_contract.document->'targets') other_target
  LEFT JOIN lzc.application_platform_sources other_source ON other_source.revision=other_contract.revision
  WHERE own_source.state_key=p_state AND own_target.value->>'folder_id'=other_target.value->>'folder_id'
   AND (other_source.state_key IS NULL OR other_source.state_key<>p_state))
 THEN RAISE EXCEPTION 'retirement_shared_scope_requires_review' USING ERRCODE='40001'; END IF;
 SELECT coalesce(nullif(p.manifest#>>'{configuration,name}',''),nullif(p.manifest#>>'{configuration,draft,name}',''),'Landing Zone '||left(state.configuration_id,8),'Landing Zone') INTO display_name
 FROM lzc.plan_runs run JOIN lzc.deployment_preparations p ON p.id=run.preparation_id WHERE run.state_key=p_state ORDER BY run.created_at DESC LIMIT 1;
 INSERT INTO lzc.platform_retirements(tenant_id,state_key,organization_id,created_by,name,reason,not_before,applications)
 VALUES(state.tenant_id,p_state,organization,lzc.current_user_id(),coalesce(display_name,'Landing Zone'),p_reason,coalesce(p_not_before,clock_timestamp()+interval '7 days'),apps) RETURNING id INTO entry;
 INSERT INTO lzc.retirement_scopes(retirement_id,kind,identity)
 SELECT entry,'revision',revision::text FROM lzc.application_platform_sources WHERE state_key=p_state AND tenant_id=state.tenant_id;
 INSERT INTO lzc.retirement_scopes(retirement_id,kind,identity)
 SELECT DISTINCT entry,'parent',target.value->>'folder_id' FROM lzc.application_platform_sources source
 JOIN lzc.application_platform_contracts contract ON contract.revision=source.revision CROSS JOIN LATERAL jsonb_each(contract.document->'targets') target
 WHERE source.state_key=p_state AND source.tenant_id=state.tenant_id ON CONFLICT DO NOTHING;
 -- Generation zero permanently invalidates capabilities prepared before the fence.
 INSERT INTO lzc.retirement_job_generations(job_id,retirement_id,generation)
 SELECT job.id,entry,0 FROM lzc.application_jobs job JOIN jsonb_array_elements(apps) app ON app->>'id'=job.instance_id::text
 ON CONFLICT DO NOTHING;
 UPDATE lzc.platform_retirements SET destructive_started_at=clock_timestamp() WHERE id=entry AND EXISTS(
  SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id
  JOIN jsonb_array_elements(apps) app ON app->>'id'=job.instance_id::text
  WHERE job.operation='apply' AND job.inputs->>'purpose'='destroy' AND dispatch.status NOT IN ('succeeded','failed','cancelled')
 );
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(entry,lzc.current_user_id(),1,'started');
 FOR item IN SELECT DISTINCT (a->>'requestedBy')::uuid AS recipient FROM jsonb_array_elements(apps) a LOOP
  PERFORM lzc_auth.enqueue_notification(state.tenant_id,item.recipient,entry::text||':announced','retirement','retirement-announced','retirement',entry);
 END LOOP;
 RETURN lzc_auth.retirement_view(entry);
END $$;
CREATE FUNCTION lzc_auth.retirement_change(p_session uuid,p_id uuid,p_generation bigint,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; next_phase text;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF r.phase IN ('COMPLETE','CANCELLED') THEN RAISE EXCEPTION 'retirement_terminal' USING ERRCODE='40001'; END IF;
 next_phase:=r.phase;
 IF p_action='pause' AND r.phase<>'PAUSED' THEN next_phase:='PAUSED';
 ELSIF p_action='resume' AND r.phase='PAUSED' THEN next_phase:=r.resume_phase;
 ELSIF p_action='cancel' AND r.destructive_started_at IS NULL AND jsonb_array_length(lzc_auth.retirement_blockers(r.id)-'retirement-preparation-window')=0 THEN next_phase:='CANCELLED';
 ELSIF p_action='inspect' THEN
  IF r.phase IN ('RETIRING','DRAINING') THEN
   next_phase:=CASE WHEN jsonb_array_length(lzc_auth.retirement_blockers(r.id))=0 THEN 'PREPARED' ELSE 'DRAINING' END;
  END IF;
 ELSE RAISE EXCEPTION 'retirement_transition_unavailable' USING ERRCODE='40001'; END IF;
 UPDATE lzc.platform_retirements SET phase=next_phase,generation=generation+CASE WHEN p_action='inspect' THEN 0 ELSE 1 END,
  invalidated_at=CASE WHEN p_action='inspect' THEN invalidated_at ELSE clock_timestamp() END,
  resume_phase=CASE WHEN p_action='pause' THEN r.phase ELSE resume_phase END WHERE id=r.id;
 INSERT INTO lzc.retirement_events(retirement_id,actor_id,generation,action) VALUES(r.id,lzc.current_user_id(),r.generation+CASE WHEN p_action='inspect' THEN 0 ELSE 1 END,p_action);
 RETURN lzc_auth.retirement_view(r.id);
END $$;

CREATE FUNCTION lzc.guard_retirement_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE revision uuid; job lzc.application_jobs; retirement uuid; marker lzc.retirement_job_generations;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 IF TG_TABLE_NAME='application_platform_contracts' THEN
  IF EXISTS(SELECT 1 FROM jsonb_each(NEW.document->'targets') target JOIN lzc.retirement_scopes s ON s.kind='parent' AND s.identity=target.value->>'folder_id'
   JOIN lzc.platform_retirements r ON r.id=s.retirement_id WHERE r.phase<>'CANCELLED')
  THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='application_platform_sources' THEN
  IF EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.state_key=NEW.state_key AND r.phase<>'CANCELLED')
  THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='application_instances' OR TG_TABLE_NAME='application_template_versions' THEN
  IF TG_TABLE_NAME='application_instances' THEN SELECT platform_revision INTO revision FROM lzc.application_template_versions WHERE id=NEW.version_id;
  ELSE revision:=NEW.platform_revision; END IF;
  retirement:=lzc_auth.retirement_contract(revision);
 ELSIF TG_TABLE_NAME IN ('application_upgrade_candidates','application_execution_bindings') THEN
  SELECT lzc_auth.effective_application_platform_revision(NEW.instance_id) INTO revision;
  retirement:=lzc_auth.retirement_contract(revision);
  IF TG_TABLE_NAME='application_upgrade_candidates' THEN retirement:=coalesce(retirement,lzc_auth.retirement_contract(NEW.platform_revision)); END IF;
 ELSE
  IF TG_TABLE_NAME='application_jobs' THEN job:=NEW;
  ELSE SELECT * INTO job FROM lzc.application_jobs WHERE id=NEW.job_id; END IF;
  SELECT lzc_auth.effective_application_platform_revision(job.instance_id) INTO revision;
  retirement:=lzc_auth.retirement_contract(revision);
  IF EXISTS(SELECT 1 FROM lzc.retirement_job_generations job_marker JOIN lzc.platform_retirements r ON r.id=job_marker.retirement_id
   WHERE (job_marker.job_id=job.id OR job_marker.job_id=job.plan_id) AND (r.phase='CANCELLED' OR job_marker.generation<>r.generation))
  THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
  IF retirement IS NOT NULL AND job.inputs->>'purpose'='destroy' AND EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=retirement AND r.phase NOT IN ('PAUSED','COMPLETE','NEEDS_ATTENTION') AND job.created_at>=r.created_at) THEN
   IF TG_TABLE_NAME='application_jobs' THEN
    -- Deferred to AFTER INSERT because the immutable job must exist first.
    RETURN NEW;
   END IF;
   SELECT * INTO marker FROM lzc.retirement_job_generations WHERE job_id=job.id;
   IF marker.retirement_id=retirement AND marker.generation=(SELECT generation FROM lzc.platform_retirements WHERE id=retirement) THEN
    IF TG_TABLE_NAME='application_dispatches' AND job.operation='apply' THEN
     UPDATE lzc.platform_retirements SET destructive_started_at=coalesce(destructive_started_at,clock_timestamp()) WHERE id=retirement;
    END IF;
    RETURN NEW;
   END IF;
  END IF;
 END IF;
 IF retirement IS NOT NULL THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION lzc.record_retirement_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retirement uuid;
BEGIN
 SELECT lzc_auth.retirement_contract(lzc_auth.effective_application_platform_revision(NEW.instance_id)) INTO retirement;
 IF retirement IS NOT NULL THEN
  INSERT INTO lzc.retirement_job_generations(job_id,retirement_id,generation) SELECT NEW.id,retirement,generation FROM lzc.platform_retirements WHERE id=retirement;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_retirement_job_marker AFTER INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.record_retirement_job();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['application_platform_contracts','application_platform_sources','application_instances','application_template_versions','application_jobs','application_runner_tickets','application_job_claims','application_job_backends','application_dispatches','application_upgrade_candidates','application_execution_bindings'] LOOP
  EXECUTE format('CREATE TRIGGER a_retirement_admission BEFORE INSERT ON lzc.%I FOR EACH ROW EXECUTE FUNCTION lzc.guard_retirement_admission()',tab);
 END LOOP;
END $$;
CREATE TRIGGER a_retirement_ticket_consume BEFORE UPDATE OF consumed_at ON lzc.application_runner_tickets FOR EACH ROW WHEN(OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL) EXECUTE FUNCTION lzc.guard_retirement_admission();

CREATE FUNCTION lzc_auth.application_platform_retiring(p_revision uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_platform_contracts c WHERE c.revision=p_revision AND c.tenant_id=lzc.current_tenant_id()
  AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')) AND lzc_auth.retirement_contract(c.revision) IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_platform_retiring(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_platform_retiring(uuid) TO configurator_app;
CREATE FUNCTION lzc_auth.platform_run_retired(p_run uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.plan_runs run JOIN lzc.platform_retirements r ON r.state_key=run.state_key
  WHERE run.id=p_run AND run.tenant_id=lzc.current_tenant_id() AND (r.phase<>'CANCELLED' OR run.created_at<=r.invalidated_at));
$$;
REVOKE ALL ON FUNCTION lzc_auth.platform_run_retired(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.platform_run_retired(uuid) TO configurator_app;
CREATE FUNCTION lzc_auth.assert_retirement_job_release(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; retirement uuid;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 retirement:=lzc_auth.retirement_contract(lzc_auth.effective_application_platform_revision(job.instance_id));
 IF EXISTS(SELECT 1 FROM lzc.retirement_job_generations marker JOIN lzc.platform_retirements r ON r.id=marker.retirement_id
  WHERE (marker.job_id=job.id OR marker.job_id=job.plan_id) AND (r.phase IN ('CANCELLED','PAUSED','COMPLETE','NEEDS_ATTENTION') OR marker.generation<>r.generation))
  OR (retirement IS NOT NULL AND (job.inputs->>'purpose' IS DISTINCT FROM 'destroy' OR NOT EXISTS(
   SELECT 1 FROM lzc.retirement_job_generations marker JOIN lzc.platform_retirements r ON r.id=marker.retirement_id
   WHERE marker.job_id=job.id AND marker.retirement_id=retirement AND marker.generation=r.generation
    AND r.phase NOT IN ('CANCELLED','PAUSED','COMPLETE','NEEDS_ATTENTION'))))
 THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
END $$;
CREATE FUNCTION lzc_auth.assert_retirement_platform_release(p_run uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.retirement_lock();
 IF lzc_auth.platform_run_retired(p_run) THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_retirement_job_release(uuid),lzc_auth.assert_retirement_platform_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.assert_retirement_job_release(uuid),lzc_auth.assert_retirement_platform_release(uuid) TO configurator_app;

CREATE FUNCTION lzc.guard_retirement_platform() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run lzc.plan_runs;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 IF TG_TABLE_NAME='plan_runs' THEN run:=NEW; ELSE SELECT * INTO run FROM lzc.plan_runs WHERE id=NEW.run_id; END IF;
 IF EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.state_key=run.state_key AND (r.phase<>'CANCELLED' OR run.created_at<=r.invalidated_at))
 THEN RAISE EXCEPTION 'retirement_admission_closed' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_retirement_platform BEFORE INSERT ON lzc.plan_runs FOR EACH ROW EXECUTE FUNCTION lzc.guard_retirement_platform();
CREATE TRIGGER a_retirement_platform_claim BEFORE UPDATE OF input_claimed ON lzc.plan_runs FOR EACH ROW WHEN(NOT OLD.input_claimed AND NEW.input_claimed) EXECUTE FUNCTION lzc.guard_retirement_platform();
CREATE TRIGGER a_retirement_platform_dispatch BEFORE UPDATE OF runner_app_id ON lzc.plan_runs FOR EACH ROW WHEN(OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL) EXECUTE FUNCTION lzc.guard_retirement_platform();
CREATE TRIGGER a_retirement_platform_credential BEFORE UPDATE OF consumed_at ON lzc.plan_credential_grants FOR EACH ROW WHEN(OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL) EXECUTE FUNCTION lzc.guard_retirement_platform();

-- Retirement notices remain visible after the affected order has been archived.
ALTER TABLE lzc_auth.notifications DROP CONSTRAINT notifications_resource_type_check;
ALTER TABLE lzc_auth.notifications ADD CHECK(resource_type IN ('invitation','application','platform','workspace','retirement'));
DO $$ DECLARE definition text; anchor text; BEGIN
 definition:=pg_get_functiondef('lzc_auth.notification_visible(lzc_auth.notifications)'::regprocedure);
 anchor:='WHEN ''application'' THEN';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'retirement_notification_visibility_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,$visibility$
 WHEN 'retirement' THEN EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.id=n.resource_id AND r.tenant_id=n.tenant_id AND (
  'platform-engineer'=ANY(m.product_roles) OR ('application-owner'=ANY(m.product_roles) AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.applications) a WHERE a->>'requestedBy'=n.user_id::text))))
 WHEN 'application' THEN
 $visibility$);
END $$;

-- Preserve existing/default email selections during a rolling migration. Retirement email is opt-in.
ALTER TABLE lzc_auth.notification_preferences DROP CONSTRAINT notification_preferences_email_topics_check;
ALTER TABLE lzc_auth.notification_preferences ADD CHECK(email_topics <@ ARRAY['approvals','execution-success','execution-failure','recovery','access','reminders','retirement']::text[]);
ALTER TABLE lzc_auth.notifications DROP CONSTRAINT notifications_topic_check;
ALTER TABLE lzc_auth.notifications ADD CHECK(topic IN ('invitations','approvals','execution-success','execution-failure','recovery','access','reminders','retirement'));
ALTER TABLE lzc_auth.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE lzc_auth.notifications ADD CHECK(kind IN ('invitation','invitation-expiring','order-pending','order-approved','order-rejected','execution-succeeded','execution-failed','execution-cancelled','recovery-required','access-changed','action-overdue','upgrade-approved','retirement-announced'));

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('lzc','lzc_auth') AND (p.proname LIKE 'retirement_%' OR p.proname IN ('guard_retirement_admission','record_retirement_job','guard_retirement_platform')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,configurator_app',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_list(uuid),lzc_auth.retirement_start(uuid,text,text,timestamptz),lzc_auth.retirement_change(uuid,uuid,bigint,text) TO configurator_app;

GRANT EXECUTE ON FUNCTION lzc_auth.retirement_candidates(uuid) TO configurator_app;
