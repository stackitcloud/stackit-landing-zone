-- Only the Worker-verified, artifact-bound audit query-store migration may retire four legacy Logs resources.
CREATE OR REPLACE FUNCTION lzc_auth.platform_application_impact(p_session uuid,p_plan uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE planned lzc.plan_runs; artifact lzc.plan_artifacts; current_state lzc.platform_states; organization uuid;
 dependencies jsonb; dependency_digest text; safety jsonb; classification text; blockers jsonb:='[]'; acknowledged boolean;
BEGIN
 -- Preserve ordinary Platform authorization for plans without Application
 -- dependants; the stronger Application PE proof applies only to their impact.
 IF NOT lzc.deployment_role() OR NOT EXISTS(SELECT 1 FROM lzc_auth.sessions s WHERE s.id=p_session AND s.user_id=lzc.current_user_id() AND coalesce(s.active_tenant_id,s.tenant_id)=lzc.current_tenant_id() AND s.expires_at>now()) THEN
  RAISE EXCEPTION 'platform_impact_access_denied' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-application-impact:'||lzc.current_tenant_id()::text,0));
 SELECT * INTO planned FROM lzc.plan_runs WHERE id=p_plan AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND operation='plan';
 IF NOT FOUND THEN RAISE EXCEPTION 'platform_impact_plan_unavailable' USING ERRCODE='42501'; END IF;
 SELECT (manifest->'organization'->>'id')::uuid INTO organization FROM lzc.deployment_preparations WHERE id=planned.preparation_id;
 SELECT * INTO current_state FROM lzc.platform_states WHERE state_key=planned.state_key AND tenant_id=planned.tenant_id AND owner_user_id=planned.owner_user_id FOR SHARE;
 SELECT * INTO artifact FROM lzc.plan_artifacts WHERE run_id=planned.id AND tenant_id=planned.tenant_id AND owner_user_id=planned.owner_user_id;
 dependencies:=lzc_auth.platform_application_dependencies(planned.tenant_id,planned.state_key,organization);
 dependency_digest:=encode(sha256(convert_to(dependencies::text,'UTF8')),'hex');
 safety:=artifact.summary->'platformImpact';
 classification:=CASE WHEN jsonb_array_length(dependencies)=0 THEN 'ordinary' ELSE coalesce(safety->>'classification','blocked') END;
 IF jsonb_array_length(dependencies)>0 THEN
  PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
  IF planned.status<>'succeeded' OR artifact.run_id IS NULL OR artifact.sha256 IS DISTINCT FROM planned.artifact_sha256 OR artifact.expires_at<=now()
   OR artifact.state_key IS DISTINCT FROM planned.state_key OR artifact.state_version IS DISTINCT FROM planned.state_version
   OR current_state.state_key IS NULL OR current_state.version IS DISTINCT FROM artifact.state_version OR current_state.lock_run_id IS NOT NULL THEN
   blockers:=blockers||jsonb_build_array('platform-impact-plan-or-state-changed');
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies) d WHERE jsonb_array_length(d->'blockers')>0) THEN blockers:=blockers||jsonb_build_array('platform-impact-application-execution-active'); END IF;
  IF safety IS NULL OR jsonb_typeof(safety)<>'object' OR safety->>'classification' NOT IN ('ordinary','sensitive','blocked')
   OR jsonb_typeof(safety->'reasons') IS DISTINCT FROM 'array' OR jsonb_typeof(safety->'changedResourceTypes') IS DISTINCT FROM 'array'
   OR jsonb_typeof(safety->'sharedChanges') IS DISTINCT FROM 'boolean' OR artifact.summary->>'completeness' IS DISTINCT FROM 'complete'
   OR (
    (artifact.summary->>'destructive'='false' AND artifact.summary#>>'{resources,delete}'='0' AND artifact.summary#>>'{resources,replace}'='0')
    OR (safety->>'classification'='sensitive'
      AND safety->'auditMigration' = '{"kind":"logs-to-observability","retiredResources":4}'::jsonb
      AND safety->>'sharedChanges'='true'
      AND safety->'changedResourceTypes'='["stackit_logs_access_token","stackit_logs_instance","stackit_observability_credential","stackit_observability_instance","stackit_telemetryrouter_destination","vault_kv_secret_v2"]'::jsonb
      AND jsonb_array_length(safety->'reasons')=8
      AND artifact.summary->>'destructive'='true'
      AND artifact.summary#>>'{resources,create}'='2' AND artifact.summary#>>'{resources,update}'='2'
      AND artifact.summary#>>'{resources,delete}'='4' AND artifact.summary#>>'{resources,replace}'='0'
      AND (SELECT count(*) FROM jsonb_array_elements(safety->'reasons') r WHERE r->>'code'='platform-audit-query-migration' AND r->>'classification'='sensitive')=4
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(safety->'reasons') r WHERE r->>'classification' IS DISTINCT FROM 'sensitive'
        OR coalesce(r->>'code','') NOT IN ('platform-audit-query-migration','platform-shared-resource-change')))
   ) IS DISTINCT FROM true
   OR (safety->>'classification'='ordinary' AND (safety->>'sharedChanges' IS DISTINCT FROM 'false' OR artifact.summary#>>'{resources,create}' IS DISTINCT FROM '0' OR artifact.summary#>>'{resources,update}' IS DISTINCT FROM '0'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(safety->'reasons')='array' THEN safety->'reasons' ELSE '[]'::jsonb END) r WHERE r->>'classification'='blocked') THEN
   classification:='blocked';blockers:=blockers||jsonb_build_array('platform-impact-evidence-unavailable');
  ELSIF classification='blocked' THEN blockers:=blockers||jsonb_build_array('platform-impact-shared-migration-blocked'); END IF;
 END IF;
 acknowledged:=EXISTS(SELECT 1 FROM lzc.platform_application_impact_acknowledgements a
  WHERE a.plan_id=planned.id AND a.artifact_sha256=artifact.sha256 AND a.dependency_hash=dependency_digest AND a.state_key=artifact.state_key AND a.state_version=artifact.state_version
  AND a.approved_by=lzc.current_user_id() AND a.issuer_session_id=p_session);
 RETURN jsonb_build_object('planId',planned.id,'artifactSha256',artifact.sha256,'dependencyHash',dependency_digest,'classification',classification,
 'affectedApplications',coalesce((SELECT jsonb_agg(jsonb_build_object('instanceId',d->>'instanceId','name',d->>'name','targetKey',d->>'targetKey')) FROM jsonb_array_elements(dependencies) d),'[]'::jsonb),
 'auditQueryMigration',classification='sensitive' AND coalesce(safety#>>'{auditMigration,kind}'='logs-to-observability',false) AND jsonb_array_length(blockers)=0,
 'blockers',blockers,'acknowledged',acknowledged,'canAcknowledge',classification='sensitive' AND jsonb_array_length(blockers)=0 AND NOT acknowledged);
END $$;
