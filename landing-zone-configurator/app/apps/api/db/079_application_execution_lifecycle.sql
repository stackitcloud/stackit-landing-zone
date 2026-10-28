-- Reviewed IaC sources are independent of the patched Worker/application package.
-- Existing publications, orders, jobs, grants and State identities are not rewritten.
CREATE TABLE lzc.application_execution_sources (
 revision text PRIMARY KEY CHECK(revision ~ '^[0-9a-f]{40}$'),
 provider_lock_sha256 text NOT NULL CHECK(provider_lock_sha256 ~ '^[0-9a-f]{64}$'),
 tofu_version text NOT NULL,
 contract_version integer NOT NULL CHECK(contract_version=1),
 status text NOT NULL CHECK(status IN ('supported','withdrawn')),
 replacement_revision text REFERENCES lzc.application_execution_sources(revision),
 CHECK(replacement_revision IS DISTINCT FROM revision)
);
ALTER TABLE lzc.application_execution_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_execution_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_sources_migration ON lzc.application_execution_sources TO configurator_migration USING(true) WITH CHECK(true);
INSERT INTO lzc.application_execution_sources(revision,provider_lock_sha256,tofu_version,contract_version,status)
 SELECT source,'d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5','1.12.6',1,
 CASE WHEN source='4d15d7870afa323badd93559d8b37c5a8d138dcf' THEN 'withdrawn' ELSE 'supported' END
 FROM unnest(ARRAY['4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f','9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d','08ac257de1548c8ec5e83dae1a79373711c3d644']) source;
UPDATE lzc.application_execution_sources SET replacement_revision='08ac257de1548c8ec5e83dae1a79373711c3d644' WHERE revision<>'08ac257de1548c8ec5e83dae1a79373711c3d644';

CREATE TABLE lzc.application_execution_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 instance_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0),
 previous_binding_id uuid REFERENCES lzc.application_execution_bindings(id),
 previous_revision text NOT NULL,
 revision text NOT NULL REFERENCES lzc.application_execution_sources(revision),
 requested_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer_session_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES lzc.application_instances(tenant_id,id),
 UNIQUE(instance_id,sequence), UNIQUE(tenant_id,id)
);
ALTER TABLE lzc.application_execution_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_execution_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_bindings_read ON lzc.application_execution_bindings FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=instance_id));
CREATE POLICY execution_bindings_migration ON lzc.application_execution_bindings TO configurator_migration USING(true) WITH CHECK(true);
CREATE TRIGGER immutable_application_execution_binding BEFORE UPDATE OR DELETE ON lzc.application_execution_bindings
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
GRANT SELECT ON lzc.application_execution_bindings TO configurator_app;

CREATE FUNCTION lzc_auth.effective_application_revision(p_instance uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT b.revision FROM lzc.application_execution_bindings b WHERE b.instance_id=i.id ORDER BY sequence DESC LIMIT 1),v.accelerator_revision)
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id WHERE i.id=p_instance;
$$;
REVOKE ALL ON FUNCTION lzc_auth.effective_application_revision(uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.application_execution_blockers(p_instance uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(array_remove(ARRAY[
 CASE WHEN EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id WHERE j.instance_id=p_instance
  AND (d.status NOT IN ('succeeded','failed','cancelled','reconciliation_required') OR (d.status='reconciliation_required' AND NOT lzc_auth.application_recovery_replan_valid(j.id)))) THEN 'execution-or-recovery-active' END,
 CASE WHEN EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_runner_tickets t ON t.job_id=j.id WHERE j.instance_id=p_instance AND t.expires_at>now()) THEN 'runner-ticket-active' END,
 CASE WHEN EXISTS(SELECT 1 FROM lzc.application_state_recoveries r WHERE r.instance_id=p_instance AND (r.phase IN ('requested','assessing','prepared','committing','reconciliation-required') OR EXISTS(SELECT 1 FROM lzc.application_state_recovery_tasks t WHERE t.recovery_id=r.id AND t.expires_at>now() AND t.finished_at IS NULL))) THEN 'guided-recovery-active' END,
 CASE WHEN EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_job_grants g ON g.job_id=j.id WHERE j.instance_id=p_instance AND j.operation='apply' AND g.revoked_at IS NULL AND g.expires_at>now()
  AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=j.id AND d.finished_at IS NOT NULL AND d.status IN ('succeeded','failed'))) THEN 'apply-grant-active' END
 ,CASE WHEN EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_job_claims c ON c.job_id=j.id WHERE j.instance_id=p_instance AND c.expires_at>now() AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=j.id AND d.finished_at IS NOT NULL AND d.status IN ('succeeded','failed','cancelled'))) THEN 'execution-claim-active' END
 ],NULL));
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_execution_blockers(uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.application_execution_context(p_session uuid,p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; source lzc.application_execution_sources; binding lzc.application_execution_bindings; origin_revision text; blockers jsonb;
BEGIN
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id();
 IF NOT lzc_auth.application_template_group_access(ordered.tenant_id,ordered.requested_by,ordered.version_id) THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 SELECT accelerator_revision INTO origin_revision FROM lzc.application_template_versions WHERE id=ordered.version_id AND tenant_id=ordered.tenant_id;
 SELECT * INTO binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO source FROM lzc.application_execution_sources WHERE revision=coalesce(binding.revision,origin_revision);
 blockers:=lzc_auth.application_execution_blockers(p_instance);
 RETURN jsonb_build_object('revision',coalesce(binding.revision,origin_revision),'bindingId',binding.id,'originRevision',origin_revision,
  'sourceStatus',coalesce(source.status,'withdrawn'),'replacementRevision',source.replacement_revision,'providerLockSha256',source.provider_lock_sha256,
  'tofuVersion',source.tofu_version,'contractVersion',source.contract_version,'blockers',blockers,
  'canUpgrade',ordered.requested_by=lzc.current_user_id() AND source.replacement_revision IS NOT NULL AND jsonb_array_length(blockers)=0 AND EXISTS(SELECT 1 FROM lzc.application_execution_sources next WHERE next.revision=source.replacement_revision AND next.status='supported'),
  'lastAppliedRevision',(SELECT g.accelerator_revision FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id JOIN lzc.application_job_grants g ON g.job_id=j.id
   WHERE j.instance_id=p_instance AND j.operation='apply' AND d.status='succeeded' AND coalesce(j.inputs->>'purpose','standard')<>'destroy' ORDER BY d.finished_at DESC,j.id DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_execution_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_execution_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.upgrade_application_execution(p_session uuid,p_instance uuid,p_target text,p_expected_revision text,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; current_binding lzc.application_execution_bindings; current_source lzc.application_execution_sources; current_revision text;
BEGIN
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'application_upgrade_confirmation_required' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF ordered.requested_by<>lzc.current_user_id() OR NOT lzc_auth.application_template_group_access(ordered.tenant_id,ordered.requested_by,ordered.version_id) THEN
  RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 current_revision:=lzc_auth.effective_application_revision(p_instance);
 IF current_revision=p_target AND current_binding.previous_revision=p_expected_revision THEN RETURN lzc_auth.application_execution_context(p_session,p_instance); END IF;
 IF current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'application_execution_changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO current_source FROM lzc.application_execution_sources WHERE revision=current_revision;
 IF current_source.replacement_revision IS DISTINCT FROM p_target OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=p_target AND status='supported') THEN
  RAISE EXCEPTION 'application_upgrade_source_unavailable' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(lzc_auth.application_execution_blockers(p_instance))<>0 THEN RAISE EXCEPTION 'application_upgrade_execution_active' USING ERRCODE='40001'; END IF;
 -- Revocation is the sole allowed mutation of immutable old grants. It is not
 -- an update of prior job inputs, template policy, State or an Apply approval.
 UPDATE lzc.application_job_grants g SET revoked_at=coalesce(g.revoked_at,now()) FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance AND j.operation='plan' AND g.revoked_at IS NULL;
 INSERT INTO lzc.application_execution_bindings(tenant_id,instance_id,sequence,previous_binding_id,previous_revision,revision,requested_by,issuer_session_id)
 VALUES(ordered.tenant_id,p_instance,coalesce(current_binding.sequence,0)+1,current_binding.id,current_revision,p_target,lzc.current_user_id(),p_session);
 RETURN lzc_auth.application_execution_context(p_session,p_instance);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.upgrade_application_execution(uuid,uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.upgrade_application_execution(uuid,uuid,text,text,boolean) TO configurator_app;

-- Historical sources before project-scoped bucket names used the legacy
-- default. An execution upgrade must preserve those existing resource names;
-- new orders on newer sources keep their native project-id default.
CREATE FUNCTION lzc_auth.application_execution_compatibility_valid(p_instance uuid,p_inputs jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN v.accelerator_revision IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f')
  AND p_inputs->>'acceleratorRevision' IN ('9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d','08ac257de1548c8ec5e83dae1a79373711c3d644')
 THEN coalesce(p_inputs->'variables'->>'bucket_naming'='legacy',false) ELSE true END
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id WHERE i.id=p_instance;
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_execution_compatibility_valid(uuid,jsonb) FROM PUBLIC;

-- The same instance lock serializes source changes, admission and dispatch.
CREATE FUNCTION lzc_auth.assert_application_execution_binding(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; binding lzc.application_execution_bindings;
BEGIN
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_execution_binding_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM lzc.application_instances WHERE id=job.instance_id FOR UPDATE;
 SELECT * INTO binding FROM lzc.application_execution_bindings WHERE instance_id=job.instance_id ORDER BY sequence DESC LIMIT 1;
 IF job.inputs->>'acceleratorRevision' IS DISTINCT FROM lzc_auth.effective_application_revision(job.instance_id)
  OR job.inputs->>'executionBindingId' IS DISTINCT FROM binding.id::text
  OR lzc_auth.application_execution_compatibility_valid(job.instance_id,job.inputs) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=job.inputs->>'acceleratorRevision' AND status='supported') THEN
  RAISE EXCEPTION 'application_execution_binding_changed' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_execution_binding(uuid) FROM PUBLIC;

CREATE FUNCTION lzc.bind_application_execution_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding lzc.application_execution_bindings;
BEGIN
 PERFORM 1 FROM lzc.application_instances WHERE id=NEW.instance_id FOR UPDATE;
 SELECT * INTO binding FROM lzc.application_execution_bindings WHERE instance_id=NEW.instance_id ORDER BY sequence DESC LIMIT 1;
 IF NEW.inputs->>'acceleratorRevision' IS DISTINCT FROM lzc_auth.effective_application_revision(NEW.instance_id)
  OR NEW.inputs->>'executionBindingId' IS DISTINCT FROM binding.id::text
  OR lzc_auth.application_execution_compatibility_valid(NEW.instance_id,NEW.inputs) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=NEW.inputs->>'acceleratorRevision' AND status='supported') THEN
  RAISE EXCEPTION 'application_execution_binding_changed' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.bind_application_execution_source() FROM PUBLIC;
CREATE TRIGGER application_source_execution BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.bind_application_execution_source();

-- Preserve the established owner/org/profile/backend/delegation checks. Only the
-- source derivation now resolves the desired immutable per-instance binding.
DO $$ DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('lzc.issue_application_job_grant()'::regprocedure);
 IF strpos(definition,'v.accelerator_revision')=0 THEN RAISE EXCEPTION 'application_source_guard_missing'; END IF;
 EXECUTE replace(definition,'v.accelerator_revision','lzc_auth.effective_application_revision(i.id)');
END $$;

CREATE FUNCTION lzc.guard_application_execution_material() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM lzc_auth.assert_application_execution_binding(NEW.job_id);
 ELSIF TG_TABLE_NAME='application_runner_tickets' THEN
  IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL THEN PERFORM lzc_auth.assert_application_execution_binding(NEW.job_id); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_execution_material() FROM PUBLIC;
CREATE TRIGGER execution_source_material BEFORE INSERT ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_material();
CREATE TRIGGER execution_source_consume BEFORE UPDATE OF consumed_at ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_material();
CREATE TRIGGER execution_source_material BEFORE INSERT ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_material();
CREATE TRIGGER execution_source_material BEFORE INSERT ON lzc.application_job_claims FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_material();
CREATE TRIGGER execution_source_material BEFORE INSERT ON lzc.application_job_backends FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_execution_material();

-- Existing direct and delegated credential/input functions must fail closed on
-- stale/withdrawn bindings too. Reports retain the original capability rules.
DO $$ DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_job_credential_context(uuid,uuid)','lzc_auth.application_runner_input_context(uuid,uuid)','lzc_auth.claim_application_job_grant(uuid,uuid)','lzc_auth.reserve_application_dispatch(uuid,uuid)','lzc_auth.approve_application_job_backend(uuid,uuid,uuid)','lzc_auth.issue_application_runner_ticket(uuid,uuid,text,uuid,text,text)','lzc_auth.consume_application_runner_ticket(uuid,uuid,text,uuid,text,text)','lzc_auth.bind_application_dispatch(uuid,uuid,uuid,uuid)','lzc_auth.bind_application_job_execution(uuid,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'application_execution_guard_missing'; END IF;
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n PERFORM lzc_auth.assert_application_execution_binding(p_job);\n');
 END LOOP;
 -- Reports use the original source, but their context still takes the instance
 -- lock before a grant row lock, matching upgrade/material lock ordering.
 FOREACH signature IN ARRAY ARRAY['lzc_auth.delegated_application_context(uuid,uuid)','lzc_auth.delegated_application_plan_context(uuid,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'application_execution_lock_guard_missing'; END IF;
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n PERFORM 1 FROM lzc.application_instances i JOIN lzc.application_jobs j ON j.instance_id=i.id WHERE j.id=p_job FOR UPDATE OF i;\n');
 END LOOP;
 definition:=pg_get_functiondef('lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'::regprocedure);
 IF strpos(definition,'context:=lzc_auth.delegated_application_context(p_session,p_job);')=0 THEN RAISE EXCEPTION 'application_execution_guard_missing'; END IF;
 EXECUTE replace(definition,'context:=lzc_auth.delegated_application_context(p_session,p_job);',E'IF p_operation NOT IN (''stage'',''record'',''artifact'',''output'',''result'',''recovery'',''fail'') THEN PERFORM lzc_auth.assert_application_execution_binding(p_job); END IF;\n context:=lzc_auth.delegated_application_context(p_session,p_job);');
END $$;

-- Resolve source from an already bound capability, never a client-selected hash.
CREATE FUNCTION lzc_auth.application_runner_source(p_hash text,p_package uuid,p_lock text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source text;
BEGIN
 SELECT t.accelerator_revision INTO source FROM lzc.application_runner_tickets t
 JOIN lzc.application_execution_sources s ON s.revision=t.accelerator_revision AND s.provider_lock_sha256=t.provider_lock_sha256
 WHERE t.ticket_hash=p_hash AND t.runner_package_id=p_package AND t.provider_lock_sha256=p_lock AND (
  EXISTS(SELECT 1 FROM lzc_auth.resolve_delegated_application_runner(p_hash,p_package,t.accelerator_revision,p_lock,false)) OR
  EXISTS(SELECT 1 FROM lzc_auth.resolve_delegated_application_runner(p_hash,p_package,t.accelerator_revision,p_lock,true)) OR
  EXISTS(SELECT 1 FROM lzc_auth.resolve_application_runner_ticket(p_hash,p_package,t.accelerator_revision,p_lock)) OR
  EXISTS(SELECT 1 FROM lzc_auth.resolve_application_runner_report(p_hash,p_package,t.accelerator_revision,p_lock)));
 IF source IS NOT NULL THEN RETURN source; END IF;
 SELECT g.accelerator_revision INTO source FROM lzc.application_state_recovery_tasks t
 JOIN lzc.application_state_recoveries r ON r.id=t.recovery_id JOIN lzc.application_job_grants g ON g.job_id=r.job_id
 JOIN lzc.application_execution_sources s ON s.revision=g.accelerator_revision AND s.provider_lock_sha256=p_lock
 WHERE t.ticket_hash=p_hash AND t.runner_package_id=p_package AND EXISTS(SELECT 1 FROM lzc_auth.resolve_application_state_recovery_task(p_hash,p_package));
 IF source IS NULL THEN RAISE EXCEPTION 'invalid_application_runner_ticket' USING ERRCODE='42501'; END IF;
 RETURN source;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_runner_source(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_runner_source(text,uuid,text) TO configurator_app;

-- Product releases may change the configured package while an older immutable
-- ticket is reporting. Only the opaque capability chooses its original package.
CREATE FUNCTION lzc_auth.application_runner_binding(p_hash text,p_lock text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE package uuid; source text;
BEGIN
 SELECT runner_package_id INTO package FROM lzc.application_runner_tickets WHERE ticket_hash=p_hash AND provider_lock_sha256=p_lock;
 IF package IS NULL THEN
  SELECT runner_package_id INTO package FROM lzc.application_state_recovery_tasks WHERE ticket_hash=p_hash;
 END IF;
 IF package IS NULL THEN RAISE EXCEPTION 'invalid_application_runner_ticket' USING ERRCODE='42501'; END IF;
 source:=lzc_auth.application_runner_source(p_hash,package,p_lock);
 RETURN jsonb_build_object('runnerPackageId',package,'acceleratorRevision',source,'providerLockSha256',p_lock);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_runner_binding(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_runner_binding(text,text) TO configurator_app;

-- Recovery deliberately uses the failed job's original source. Withdrawal also
-- fences this separate material channel; it never authorizes a newer source to
-- rewrite an unresolved checkpoint. Existing task reports remain resolvable.
CREATE FUNCTION lzc_auth.assert_application_recovery_source(p_recovery uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source text; status text;
BEGIN
 PERFORM 1 FROM lzc.application_instances i JOIN lzc.application_state_recoveries r ON r.instance_id=i.id WHERE r.id=p_recovery FOR UPDATE OF i;
 SELECT g.accelerator_revision INTO source FROM lzc.application_state_recoveries r JOIN lzc.application_job_grants g ON g.job_id=r.job_id WHERE r.id=p_recovery;
 SELECT s.status INTO status FROM lzc.application_execution_sources s WHERE s.revision=source FOR SHARE;
 IF status IS DISTINCT FROM 'supported' THEN RAISE EXCEPTION 'application_recovery_source_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_recovery_source(uuid) FROM PUBLIC;

CREATE FUNCTION lzc.guard_application_recovery_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM lzc_auth.assert_application_recovery_source(NEW.recovery_id);
 ELSIF (OLD.input_released_at IS NULL AND NEW.input_released_at IS NOT NULL) OR
       (OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL) THEN
  PERFORM lzc_auth.assert_application_recovery_source(NEW.recovery_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_recovery_source() FROM PUBLIC;
CREATE TRIGGER execution_source_recovery_admission BEFORE INSERT ON lzc.application_state_recovery_tasks FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_recovery_source();
CREATE TRIGGER execution_source_recovery_material BEFORE UPDATE OF input_released_at,runner_app_id ON lzc.application_state_recovery_tasks FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_recovery_source();

DO $$ DECLARE signature text; definition text; guard text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'lzc_auth.begin_application_state_recovery_task(uuid,uuid,uuid,text,text,bytea,jsonb)',
  'lzc_auth.bind_application_state_recovery_task(uuid,uuid,uuid,uuid)',
  'lzc_auth.release_application_state_recovery_input(uuid,uuid)',
  'lzc_auth.fence_application_state_recovery(uuid,uuid,text)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'application_recovery_source_guard_missing'; END IF;
  guard:=CASE WHEN signature LIKE '%begin_application%' THEN 'PERFORM lzc_auth.assert_application_recovery_source(p_id);'
   ELSE 'PERFORM lzc_auth.assert_application_recovery_source((SELECT recovery_id FROM lzc.application_state_recovery_tasks WHERE id=p_task));' END;
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n '||guard||E'\n');
 END LOOP;
END $$;
