-- Retirement uses native Apply/State evidence, independently of Application publication.
CREATE FUNCTION lzc_auth.retirement_applied_state(p_state lzc.platform_states,p_apply uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(p_state.version>0 AND p_state.stable_aad AND p_state.lock_run_id IS NULL
  AND lzc_auth.platform_state_backend_settled(p_state)
  AND EXISTS(SELECT 1 FROM lzc.plan_runs run JOIN lzc.deployment_preparations p ON p.id=run.preparation_id
   JOIN lzc.tenants t ON t.id=run.tenant_id
   WHERE run.id=p_apply AND run.tenant_id=p_state.tenant_id AND run.state_key=p_state.state_key
    AND run.operation='apply' AND run.status='succeeded' AND run.finished_at IS NOT NULL
    AND run.applied_state_version=p_state.version AND t.organization_id::text=p.manifest#>>'{organization,id}'),false);
$$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_applied_state(lzc.platform_states,uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.retirement_start_context(p_session uuid,p_state text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc.platform_states; applied uuid;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT * INTO s FROM lzc.platform_states WHERE state_key=p_state AND tenant_id=lzc.current_tenant_id();
 SELECT run.id INTO applied FROM lzc.plan_runs run WHERE run.state_key=s.state_key
  AND lzc_auth.retirement_applied_state(s,run.id) ORDER BY run.finished_at DESC,run.id DESC LIMIT 1;
 IF applied IS NULL THEN RAISE EXCEPTION 'retirement_state_unavailable' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('stateKey',s.state_key,'stateVersion',s.version::text,'applyRunId',applied,
  'backendId',s.backend_id,'stateCiphertext',encode(s.ciphertext,'base64'));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_start_context(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_start_context(uuid,text) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.retirement_candidates(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 SELECT coalesce(jsonb_agg(candidate),'[]') INTO result FROM (
  SELECT jsonb_build_object('stateKey',s.state_key,'name',coalesce(nullif(p.manifest#>>'{configuration,name}',''),nullif(p.manifest#>>'{configuration,draft,name}',''),'Landing Zone'),
   'applicationCount',(SELECT count(*) FROM lzc.application_instances i
    WHERE i.tenant_id=s.tenant_id AND EXISTS(SELECT 1 FROM lzc.application_platform_sources source
     WHERE source.state_key=s.state_key AND source.revision=lzc_auth.effective_application_platform_revision(i.id)))) candidate
  FROM lzc.platform_states s JOIN LATERAL(SELECT run.preparation_id FROM lzc.plan_runs run
    WHERE run.state_key=s.state_key AND lzc_auth.retirement_applied_state(s,run.id)
    ORDER BY run.finished_at DESC,run.id DESC LIMIT 1) applied ON true
  JOIN lzc.deployment_preparations p ON p.id=applied.preparation_id
  WHERE s.tenant_id=lzc.current_tenant_id()
   AND NOT EXISTS(SELECT 1 FROM lzc.platform_retirements r WHERE r.state_key=s.state_key AND r.phase<>'CANCELLED')
  ORDER BY s.state_key LIMIT 100
 ) available;
 RETURN result;
END $$;

CREATE FUNCTION lzc_auth.retirement_start(p_session uuid,p_state text,p_reason text,p_not_before timestamptz,p_apply uuid,p_folders uuid[]) RETURNS jsonb
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
 IF p_apply IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM lzc.application_platform_sources WHERE state_key=p_state AND tenant_id=state.tenant_id)
  THEN RAISE EXCEPTION 'retirement_applied_binding_required' USING ERRCODE='40001'; END IF;
 ELSE
  IF NOT lzc_auth.retirement_applied_state(state,p_apply) OR p_folders IS NULL OR cardinality(p_folders)>1000 OR array_position(p_folders,NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'retirement_state_unavailable' USING ERRCODE='40001'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'requestedBy',i.requested_by) ORDER BY i.id),'[]') INTO apps
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id
 JOIN lzc.application_platform_contracts contract ON contract.revision=lzc_auth.effective_application_platform_revision(i.id)
 WHERE i.tenant_id=state.tenant_id AND (
  EXISTS(SELECT 1 FROM jsonb_each(contract.document->'targets') target WHERE target.value->>'folder_id'=ANY(p_folders::text[]))
  OR EXISTS(SELECT 1 FROM lzc.application_platform_sources source WHERE source.state_key=p_state AND source.revision=contract.revision)
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
 IF EXISTS(SELECT 1 FROM lzc.application_platform_contracts c CROSS JOIN LATERAL jsonb_each(c.document->'targets') target
  LEFT JOIN lzc.application_platform_sources source ON source.revision=c.revision
  WHERE target.value->>'folder_id'=ANY(p_folders::text[]) AND (source.state_key IS NULL OR source.state_key<>p_state))
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
 INSERT INTO lzc.retirement_scopes(retirement_id,kind,identity)
 SELECT DISTINCT entry,'parent',folder::text FROM unnest(p_folders) folder ON CONFLICT DO NOTHING;
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
REVOKE ALL ON FUNCTION lzc_auth.retirement_start(uuid,text,text,timestamptz,uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_start(uuid,text,text,timestamptz,uuid,uuid[]) TO configurator_app;

-- Keep the legacy bound-platform entry point for existing internal consumers.
CREATE OR REPLACE FUNCTION lzc_auth.retirement_start(p_session uuid,p_state text,p_reason text,p_not_before timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.retirement_start(p_session,p_state,p_reason,p_not_before,NULL,NULL);
$$;

CREATE OR REPLACE FUNCTION lzc_auth.retirement_capture_context(p_session uuid,p_id uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.platform_retirements; root lzc.platform_states; manifest jsonb; applied uuid; apps jsonb; missing boolean;
BEGIN
 PERFORM lzc_auth.retirement_authorize(p_session);
 PERFORM lzc_auth.retirement_lock();
 SELECT * INTO r FROM lzc.platform_retirements WHERE id=p_id AND tenant_id=lzc.current_tenant_id() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'retirement_access_denied' USING ERRCODE='42501'; END IF;
 IF r.generation<>p_generation OR r.phase NOT IN ('RETIRING','DRAINING','PREPARED') THEN RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 -- Capturing evidence before not_before is allowed; destructive execution is not.
 IF jsonb_array_length(lzc_auth.retirement_blockers(r.id)-'retirement-preparation-window')>0 THEN
  RAISE EXCEPTION 'retirement_writers_unresolved' USING ERRCODE='40001'; END IF;
 SELECT * INTO root FROM lzc.platform_states WHERE state_key=r.state_key AND tenant_id=r.tenant_id;
 IF NOT FOUND OR root.lock_run_id IS NOT NULL OR NOT lzc_auth.platform_state_backend_settled(root) OR NOT root.stable_aad THEN
  RAISE EXCEPTION 'retirement_state_unavailable' USING ERRCODE='40001'; END IF;
 SELECT p.manifest,run.id INTO manifest,applied FROM lzc.plan_runs run JOIN lzc.deployment_preparations p ON p.id=run.preparation_id
 WHERE run.state_key=r.state_key AND run.tenant_id=r.tenant_id AND run.operation='apply' AND run.status='succeeded'
 ORDER BY run.finished_at DESC,run.created_at DESC LIMIT 1;
 IF applied IS NULL OR manifest#>>'{organization,id}' IS DISTINCT FROM r.organization_id::text THEN
  RAISE EXCEPTION 'retirement_applied_binding_required' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(r.applications)>100 THEN RAISE EXCEPTION 'retirement_scope_requires_batch_review' USING ERRCODE='40001'; END IF;
 -- A claimed/dispatched order without a successful native Apply is not assumed empty.
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(r.applications) item WHERE
  (EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_job_claims c ON c.job_id=j.id WHERE j.instance_id=(item->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.instance_id=(item->>'id')::uuid))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id
   WHERE j.instance_id=(item->>'id')::uuid AND j.operation='apply' AND d.status='succeeded')) INTO missing;
 IF missing THEN RAISE EXCEPTION 'retirement_application_state_unresolved' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(scope ORDER BY scope->>'scopeKey'),'[]') INTO apps FROM (
  SELECT jsonb_build_object('scopeKey','applications/'||r.tenant_id::text||'/'||j.instance_id::text||'/terraform.tfstate',
   'instanceId',j.instance_id,'requestedBy',item->>'requestedBy','backendId',b.backend_id,'descriptor',b.descriptor,
   'inputs',j.inputs-'tfvars','appliedRunId',j.id,'sourceRevision',j.inputs->>'acceleratorRevision') AS scope
  FROM jsonb_array_elements(r.applications) item JOIN LATERAL(
   SELECT job.* FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id
    WHERE job.instance_id=(item->>'id')::uuid AND job.operation='apply' AND dispatch.status='succeeded'
    ORDER BY dispatch.finished_at DESC,job.created_at DESC LIMIT 1
  ) j ON true LEFT JOIN lzc.application_job_backends b ON b.job_id=j.id
 ) scopes;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(apps) scope WHERE scope->>'backendId' IS NULL OR scope->>'sourceRevision' IS NULL) THEN
  RAISE EXCEPTION 'retirement_application_state_unresolved' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('retirementId',r.id,'generation',r.generation,'organizationId',r.organization_id,
  'root',jsonb_build_object('scopeKey',r.state_key,'backendId',root.backend_id,'stateVersion',root.version,
   'stateCiphertext',encode(root.ciphertext,'base64'),'stateIdentity',root.remote_identity,
   'manifest',manifest,'appliedRunId',applied),'applications',apps);
END $$;
