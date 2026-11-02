-- Resolve only reviewed direct paths or one explicitly shared supported successor.
-- Preview and persistence use the same resolver; orders and immutable versions stay intact.
CREATE FUNCTION lzc_auth.application_upgrade_execution_source(p_current text,p_template text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_source lzc.application_execution_sources; target_source lzc.application_execution_sources;
BEGIN
 SELECT * INTO current_source FROM lzc.application_execution_sources WHERE revision=p_current;
 SELECT * INTO target_source FROM lzc.application_execution_sources WHERE revision=p_template AND status='supported';
 IF current_source.revision IS NOT NULL AND target_source.revision IS NOT NULL THEN
  IF p_current=p_template AND current_source.status='supported' THEN RETURN p_current; END IF;
  IF current_source.replacement_revision=p_template THEN RETURN p_template; END IF;
  IF target_source.replacement_revision=p_current AND current_source.status='supported' THEN RETURN p_current; END IF;
  IF current_source.replacement_revision=target_source.replacement_revision AND EXISTS(
   SELECT 1 FROM lzc.application_execution_sources s WHERE s.revision=current_source.replacement_revision AND s.status='supported'
  ) THEN RETURN current_source.replacement_revision; END IF;
 END IF;
 RAISE EXCEPTION 'application_upgrade_source_unavailable' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_execution_source(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_execution_source(text,text) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.request_application_upgrade(p_session uuid,p_instance uuid,p_edge uuid,p_expected_binding uuid,p_expected_version uuid,p_parameters jsonb,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; current_candidate lzc.application_upgrade_candidates; edge lzc.application_upgrade_edges;
 old lzc.application_template_versions; target lzc.application_template_versions; old_contract lzc.application_platform_contracts; target_contract lzc.application_platform_contracts;
 parameters jsonb; settings jsonb; source text; execution_binding uuid; snapshot jsonb; candidate_id uuid:=gen_random_uuid(); policy text; path text;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO ordered FROM lzc_auth.effective_application_order(p_instance);
 IF ordered.requested_by<>lzc.current_user_id() OR p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_candidate FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 IF current_candidate.id IS DISTINCT FROM p_expected_binding OR ordered.version_id IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(lzc_auth.application_execution_blockers(p_instance))>0 THEN RAISE EXCEPTION 'application_upgrade_execution_active' USING ERRCODE='40001'; END IF;
 SELECT * INTO edge FROM lzc.application_upgrade_edges WHERE id=p_edge AND tenant_id=ordered.tenant_id AND from_version_id=ordered.version_id;
 IF NOT FOUND OR NOT lzc_auth.application_template_group_access(ordered.tenant_id,ordered.requested_by,edge.to_version_id) THEN RAISE EXCEPTION 'application_upgrade_edge_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM lzc.application_template_versions WHERE id=ordered.version_id;
 SELECT * INTO target FROM lzc.application_template_versions WHERE id=edge.to_version_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:'||ordered.tenant_id::text||':'||target.id::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_template_retirements WHERE version_id=target.id) OR EXISTS(SELECT 1 FROM lzc.application_template_deletions WHERE version_id=target.id)
  OR old.target_key IS DISTINCT FROM target.target_key OR old.document->>'kind' IS DISTINCT FROM target.document->>'kind' THEN RAISE EXCEPTION 'application_upgrade_target_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO old_contract FROM lzc.application_platform_contracts WHERE revision=lzc_auth.effective_application_platform_revision(p_instance);
 SELECT * INTO target_contract FROM lzc.application_platform_contracts WHERE revision=target.platform_revision;
 IF old_contract.organization_id IS DISTINCT FROM target_contract.organization_id OR target_contract.tenant_id IS DISTINCT FROM ordered.tenant_id
  OR (old_contract.revision<>target_contract.revision AND NOT EXISTS(SELECT 1 FROM lzc.application_platform_sources a JOIN lzc.application_platform_sources b ON b.tenant_id=a.tenant_id AND b.state_key=a.state_key AND b.state_version>=a.state_version WHERE a.revision=old_contract.revision AND b.revision=target_contract.revision))
  OR old_contract.document#>ARRAY['targets',old.target_key,'folder_id'] IS DISTINCT FROM target_contract.document#>ARRAY['targets',target.target_key,'folder_id']
  OR old_contract.document#>ARRAY['targets',old.target_key,'region'] IS DISTINCT FROM target_contract.document#>ARRAY['targets',target.target_key,'region']
  OR old_contract.document#>ARRAY['targets',old.target_key,'corporate'] IS DISTINCT FROM target_contract.document#>ARRAY['targets',target.target_key,'corporate']
  OR old_contract.document#>ARRAY['targets',old.target_key,'network_area_id'] IS DISTINCT FROM target_contract.document#>ARRAY['targets',target.target_key,'network_area_id']
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_delegations a JOIN lzc.application_execution_delegations b ON b.backend_id=a.backend_id AND b.backend_identity=a.backend_identity AND b.backend_credentials_hash=a.backend_credentials_hash
   WHERE a.tenant_id=ordered.tenant_id AND b.tenant_id=a.tenant_id AND a.platform_revision=old_contract.revision AND b.platform_revision=target.platform_revision AND a.revoked_at IS NULL AND b.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'application_upgrade_placement_changed' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.stackit_identities h WHERE h.user_id=ordered.requested_by AND h.issuer='https://accounts.stackit.cloud' AND h.valid_until>now() AND h.revoked_at IS NULL AND h.email=ordered.resolved_settings->>'owner_email') THEN RAISE EXCEPTION 'application_upgrade_identity_unavailable' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_parameters)<>'object' THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
 parameters:=ordered.parameters||p_parameters;
 settings:=lzc_auth.resolve_application_upgrade_settings(target.document,parameters,ordered.resolved_settings->>'owner_email');
 FOREACH path IN ARRAY ARRAY['env','owner_email','initial_owner_email','network_enabled','network_prefix_length','network_range','network_area_key','project_name','region'] LOOP
  IF ordered.resolved_settings->path IS DISTINCT FROM settings->path THEN RAISE EXCEPTION 'application_upgrade_placement_changed' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (coalesce(ordered.resolved_settings->>'secretsmanager_enabled','false')='true' AND settings->>'secretsmanager_enabled'='false')
  OR (coalesce(ordered.resolved_settings#>>'{observability,enabled}','false')='true' AND settings#>>'{observability,enabled}'='false') THEN RAISE EXCEPTION 'application_upgrade_removal_blocked' USING ERRCODE='42501'; END IF;
 policy:=CASE WHEN ordered.deployment_policy='approval-required' OR target.deployment_policy='approval-required' THEN 'approval-required' ELSE 'direct' END;
 source:=lzc_auth.effective_application_revision(p_instance);
 IF lzc_auth.application_upgrade_execution_source(source,target.accelerator_revision)<>source THEN
  PERFORM lzc_auth.upgrade_application_execution(p_session,p_instance,lzc_auth.application_upgrade_execution_source(source,target.accelerator_revision),source,true);
  source:=lzc_auth.effective_application_revision(p_instance);
 END IF;
 SELECT id INTO execution_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 snapshot:=jsonb_build_object('instanceId',p_instance,'edgeId',edge.id,'versionId',target.id,'platformRevision',target.platform_revision,'parameters',parameters,'resolvedSettings',settings,'deploymentPolicy',policy,'sourceRevision',source,'executionBindingId',execution_binding,'sensitivePolicy',edge.policy->>'sensitive');
 UPDATE lzc.application_job_grants g SET revoked_at=coalesce(g.revoked_at,now()) FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance AND j.operation='plan' AND g.revoked_at IS NULL;
 INSERT INTO lzc.application_upgrade_candidates(id,tenant_id,instance_id,sequence,edge_id,previous_binding_id,version_id,platform_revision,parameters,resolved_settings,deployment_policy,source_revision,execution_binding_id,candidate_hash,requested_by,issuer_session_id,sensitive_policy)
 VALUES(candidate_id,ordered.tenant_id,p_instance,coalesce(current_candidate.sequence,0)+1,edge.id,current_candidate.id,target.id,target.platform_revision,parameters,settings,policy,source,execution_binding,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),ordered.requested_by,p_session,edge.policy->>'sensitive');
 RETURN lzc_auth.application_upgrade_context(p_session,p_instance);
END $$;
