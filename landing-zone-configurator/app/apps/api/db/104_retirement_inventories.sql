-- Immutable private preparation evidence, separate from execution authority.
CREATE TABLE lzc.retirement_inventories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 retirement_id uuid NOT NULL REFERENCES lzc.platform_retirements(id),
 generation bigint NOT NULL CHECK(generation>0),
 scope_key text NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 1024),
 instance_id uuid REFERENCES lzc.application_instances(id),
 requested_by uuid REFERENCES lzc_auth.users(id),
 captured_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 context_sha256 text NOT NULL CHECK(context_sha256 ~ '^[0-9a-f]{64}$'),
 state_sha256 text NOT NULL CHECK(state_sha256 ~ '^[0-9a-f]{64}$'),
 state_identity text NOT NULL,
 state_ciphertext bytea NOT NULL CHECK(octet_length(state_ciphertext) BETWEEN 29 AND 16777244),
 inventory_ciphertext bytea NOT NULL CHECK(octet_length(inventory_ciphertext) BETWEEN 29 AND 16777244),
 source_ciphertext bytea NOT NULL CHECK(octet_length(source_ciphertext) BETWEEN 29 AND 16777244),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(retirement_id,generation,scope_key)
);
ALTER TABLE lzc.retirement_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.retirement_inventories FORCE ROW LEVEL SECURITY;
CREATE POLICY retirement_inventory_migration ON lzc.retirement_inventories TO configurator_migration USING(true) WITH CHECK(true);
CREATE TRIGGER retirement_inventory_immutable BEFORE UPDATE OR DELETE ON lzc.retirement_inventories
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

-- The caller is the acting Platform Owner, never a substituted requester session.
CREATE FUNCTION lzc_auth.retirement_capture_context(p_session uuid,p_id uuid,p_generation bigint) RETURNS jsonb
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
 IF NOT FOUND OR root.lock_run_id IS NOT NULL OR root.pending_backend_id IS NOT NULL OR NOT root.stable_aad THEN
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
CREATE FUNCTION lzc_auth.retirement_save_inventory(p_session uuid,p_id uuid,p_generation bigint,p_context_sha text,
 p_scope text,p_state_sha text,p_identity text,p_state bytea,p_inventory bytea,p_source bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE context jsonb; scope jsonb; entry uuid; existing lzc.retirement_inventories;
BEGIN
 context:=lzc_auth.retirement_capture_context(p_session,p_id,p_generation);
 IF encode(sha256(convert_to(context::text,'UTF8')),'hex')<>p_context_sha THEN
  RAISE EXCEPTION 'retirement_changed' USING ERRCODE='40001'; END IF;
 IF context#>>'{root,scopeKey}'=p_scope THEN scope:=context->'root';
 ELSE SELECT value INTO scope FROM jsonb_array_elements(context->'applications') WHERE value->>'scopeKey'=p_scope; END IF;
 IF scope IS NULL THEN RAISE EXCEPTION 'retirement_scope_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM lzc.retirement_inventories WHERE retirement_id=p_id AND generation=p_generation AND scope_key=p_scope;
 IF FOUND THEN
  IF existing.context_sha256<>p_context_sha OR existing.state_sha256<>p_state_sha OR existing.state_identity<>p_identity THEN
   RAISE EXCEPTION 'retirement_inventory_changed' USING ERRCODE='40001'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO lzc.retirement_inventories(retirement_id,generation,scope_key,instance_id,requested_by,captured_by,context_sha256,
  state_sha256,state_identity,state_ciphertext,inventory_ciphertext,source_ciphertext)
 VALUES(p_id,p_generation,p_scope,(scope->>'instanceId')::uuid,(scope->>'requestedBy')::uuid,lzc.current_user_id(),p_context_sha,
  p_state_sha,p_identity,p_state,p_inventory,p_source) RETURNING id INTO entry;
 RETURN entry;
END $$;
CREATE FUNCTION lzc_auth.retirement_capture_digest(p_session uuid,p_id uuid,p_generation bigint) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(lzc_auth.retirement_capture_context(p_session,p_id,p_generation)::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION lzc_auth.retirement_capture_context(uuid,uuid,bigint),lzc_auth.retirement_capture_digest(uuid,uuid,bigint),lzc_auth.retirement_save_inventory(uuid,uuid,bigint,text,text,text,text,bytea,bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.retirement_capture_context(uuid,uuid,bigint),lzc_auth.retirement_capture_digest(uuid,uuid,bigint),lzc_auth.retirement_save_inventory(uuid,uuid,bigint,text,text,text,text,bytea,bytea,bytea) TO configurator_app;
