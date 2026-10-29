-- Explicit, immutable template upgrade snapshots. Origins and State keys stay put.
CREATE TABLE lzc.application_upgrade_edges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 from_version_id uuid NOT NULL, to_version_id uuid NOT NULL, policy jsonb NOT NULL,
 published_by uuid NOT NULL REFERENCES lzc_auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,from_version_id) REFERENCES lzc.application_template_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,to_version_id) REFERENCES lzc.application_template_versions(tenant_id,id),
 CHECK(from_version_id<>to_version_id), CHECK(policy IN ('{"sensitive":"approval-required"}'::jsonb,'{"sensitive":"direct"}'::jsonb)),
 UNIQUE(tenant_id,from_version_id,to_version_id), UNIQUE(tenant_id,id)
);
CREATE TABLE lzc.application_upgrade_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id), instance_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), kind text NOT NULL DEFAULT 'template' CHECK(kind IN ('template','platform')), edge_id uuid, platform_edge_id uuid,
 sensitive_policy text NOT NULL DEFAULT 'approval-required' CHECK(sensitive_policy IN ('direct','approval-required')), previous_binding_id uuid REFERENCES lzc.application_upgrade_candidates(id),
 version_id uuid NOT NULL, platform_revision uuid NOT NULL, parameters jsonb NOT NULL, resolved_settings jsonb NOT NULL,
 deployment_policy text NOT NULL CHECK(deployment_policy IN ('direct','approval-required')),
 source_revision text NOT NULL REFERENCES lzc.application_execution_sources(revision), execution_binding_id uuid REFERENCES lzc.application_execution_bindings(id),
 candidate_hash text NOT NULL CHECK(candidate_hash ~ '^[a-f0-9]{64}$'), requested_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer_session_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES lzc.application_instances(tenant_id,id),
 FOREIGN KEY(tenant_id,edge_id) REFERENCES lzc.application_upgrade_edges(tenant_id,id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES lzc.application_template_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,platform_revision) REFERENCES lzc.application_platform_contracts(tenant_id,revision),
 CHECK(jsonb_typeof(parameters)='object' AND jsonb_typeof(resolved_settings)='object'),
 CHECK((kind='template' AND edge_id IS NOT NULL AND platform_edge_id IS NULL) OR (kind='platform' AND edge_id IS NULL AND platform_edge_id IS NOT NULL)), UNIQUE(instance_id,sequence), UNIQUE(tenant_id,id)
);
CREATE TABLE lzc.application_upgrade_approvals (
 candidate_id uuid NOT NULL REFERENCES lzc.application_upgrade_candidates(id), plan_id uuid NOT NULL REFERENCES lzc.application_jobs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id), candidate_hash text NOT NULL, binding_sha256 text NOT NULL,
 artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'), approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer_session_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(candidate_id,plan_id)
);
DO $$ DECLARE relation text;
BEGIN FOREACH relation IN ARRAY ARRAY['application_upgrade_edges','application_upgrade_candidates','application_upgrade_approvals'] LOOP
 EXECUTE format('ALTER TABLE lzc.%I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE lzc.%I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY migration_access ON lzc.%I TO configurator_migration USING(true) WITH CHECK(true)',relation);
 EXECUTE format('CREATE POLICY runtime_read ON lzc.%I FOR SELECT TO configurator_app USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role(''platform-engineer'') OR lzc.application_role(''application-owner'')))',relation);
 EXECUTE format('GRANT SELECT ON lzc.%I TO configurator_app',relation);
 EXECUTE format('CREATE TRIGGER immutable_upgrade BEFORE UPDATE OR DELETE ON lzc.%I FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version()',relation);
END LOOP; END $$;
-- Candidate/approval visibility follows the underlying order, including AO isolation.
DROP POLICY runtime_read ON lzc.application_upgrade_candidates;
CREATE POLICY runtime_read ON lzc.application_upgrade_candidates FOR SELECT TO configurator_app USING(tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=instance_id));
DROP POLICY runtime_read ON lzc.application_upgrade_approvals;
CREATE POLICY runtime_read ON lzc.application_upgrade_approvals FOR SELECT TO configurator_app USING(tenant_id=lzc.current_tenant_id() AND EXISTS(SELECT 1 FROM lzc.application_upgrade_candidates c WHERE c.id=candidate_id));

CREATE FUNCTION lzc_auth.application_order_snapshot(p_instance uuid,p_candidate uuid) RETURNS lzc.application_instances
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; candidate lzc.application_upgrade_candidates;
BEGIN
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance;
 IF p_candidate IS NOT NULL THEN
  SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=p_candidate AND instance_id=p_instance AND tenant_id=ordered.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='42501'; END IF;
  ordered.version_id:=candidate.version_id; ordered.parameters:=candidate.parameters; ordered.resolved_settings:=candidate.resolved_settings;
  ordered.deployment_policy:=candidate.deployment_policy;
 END IF;
 RETURN ordered;
END $$;
CREATE FUNCTION lzc_auth.effective_application_order(p_instance uuid) RETURNS lzc.application_instances
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.application_order_snapshot(p_instance,(SELECT id FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1));
$$;
CREATE FUNCTION lzc_auth.application_job_order(p_job uuid) RETURNS lzc.application_instances
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.application_order_snapshot(j.instance_id,(j.inputs->>'applicationUpgradeId')::uuid) FROM lzc.application_jobs j WHERE j.id=p_job;
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_order_snapshot(uuid,uuid),lzc_auth.effective_application_order(uuid),lzc_auth.application_job_order(uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.effective_application_platform_revision(p_instance uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT platform_revision FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1),v.platform_revision)
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id WHERE i.id=p_instance;
$$;
CREATE FUNCTION lzc_auth.application_job_platform_revision(p_job uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(c.platform_revision,v.platform_revision) FROM lzc.application_jobs j JOIN lzc.application_instances i ON i.id=j.instance_id
 JOIN lzc.application_template_versions v ON v.id=i.version_id LEFT JOIN lzc.application_upgrade_candidates c ON c.id=(j.inputs->>'applicationUpgradeId')::uuid AND c.instance_id=j.instance_id WHERE j.id=p_job;
$$;
REVOKE ALL ON FUNCTION lzc_auth.effective_application_platform_revision(uuid),lzc_auth.application_job_platform_revision(uuid) FROM PUBLIC;

-- Reproduce the small published parameter policy, never accept resolved settings
-- from a caller. The verified requester identity is mandatory and immutable.
CREATE FUNCTION lzc_auth.resolve_application_upgrade_settings(p_document jsonb,p_parameters jsonb,p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE settings jsonb:=coalesce(p_document->'settings','{}'); fields jsonb:=coalesce(p_document#>'{parameterPolicy,fields}','{}');
 path text; rule jsonb; value jsonb; profile jsonb:=p_document->'accessProfile'; roles jsonb; item jsonb;
 defaults jsonb:='{"env":"dev","secretsmanager_enabled":true,"observability.enabled":false,"observability.plan_name":"Observability-Starter-EU01","role_assignments":[]}';
BEGIN
 IF jsonb_typeof(p_parameters)<>'object' OR p_email IS NULL THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
 FOR path IN SELECT jsonb_object_keys(p_parameters) LOOP
  IF path='observability.acl' THEN CONTINUE; END IF;
  IF path NOT IN ('env','secretsmanager_enabled','observability.enabled','observability.plan_name') OR fields->path->>'source' IS DISTINCT FROM 'input' THEN
   RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
 END LOOP;
 FOREACH path IN ARRAY ARRAY['env','secretsmanager_enabled','observability.enabled','observability.plan_name','role_assignments'] LOOP
  rule:=fields->path; value:=coalesce(settings#>string_to_array(path,'.'),defaults->path);
  IF rule->>'source'='input' THEN
   IF p_parameters ? path THEN value:=p_parameters->path;
   ELSIF rule ? 'default' THEN value:=rule->'default';
   ELSIF rule->>'required'='true' THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
   IF rule ? 'choices' AND NOT (rule->'choices' @> jsonb_build_array(value)) THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
  ELSIF rule->>'source'='context' THEN
   IF path<>'role_assignments' OR rule->>'variable'<>'verified-project-owner' OR jsonb_typeof(rule->'roles')<>'array' THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
   roles:=coalesce(value,'[]');
   FOR item IN SELECT jsonb_build_object('role',r#>>'{}','subject',p_email) FROM jsonb_array_elements(rule->'roles') r LOOP
    IF NOT roles @> jsonb_build_array(item) THEN roles:=roles||jsonb_build_array(item); END IF;
   END LOOP; value:=roles;
  ELSIF coalesce(rule->>'source','fixed')<>'fixed' THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501';
  END IF;
  IF (path IN ('env','observability.plan_name') AND (jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 512))
   OR (path IN ('secretsmanager_enabled','observability.enabled') AND jsonb_typeof(value)<>'boolean')
   OR (path='role_assignments' AND jsonb_typeof(value)<>'array') THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
  IF position('.' IN path)>0 AND jsonb_typeof(settings->split_part(path,'.',1)) IS DISTINCT FROM 'object' THEN settings:=settings||jsonb_build_object(split_part(path,'.',1),'{}'::jsonb); END IF;
  settings:=jsonb_set(settings,string_to_array(path,'.'),value,true);
 END LOOP;
 settings:=jsonb_set(settings,'{observability}',(coalesce(settings->'observability','{}')-'access_source')||jsonb_build_object('acl',coalesce(settings#>'{observability,acl}','[]')),true)||jsonb_build_object('owner_email',p_email);
 IF profile IS NOT NULL THEN
  IF profile->>'schemaVersion'<>'1' THEN RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
  IF profile->>'mode'='owner' THEN settings:=settings||jsonb_build_object('automation_role','owner');
  ELSIF profile->>'mode'='granular' AND profile->>'initialOwnerEmail' IS NOT NULL AND lower(profile->>'initialOwnerEmail')<>lower(p_email) THEN
   settings:=settings||jsonb_build_object('initial_owner_email',profile->>'initialOwnerEmail','automation_role','application-automation',
    'role_assignments',jsonb_build_array(jsonb_build_object('role','application-workload','subject',p_email)),
    'custom_roles',jsonb_build_array(jsonb_build_object('name','application-workload','description','Versioned Application team workload permissions','permissions',profile->'permissions'),jsonb_build_object('name','application-automation','description','Versioned Application workload automation permissions','permissions',profile->'automationPermissions')));
  ELSE RAISE EXCEPTION 'application_upgrade_parameters_invalid' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN settings;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.resolve_application_upgrade_settings(jsonb,jsonb,text) FROM PUBLIC;

CREATE FUNCTION lzc_auth.publish_application_upgrade_edge(p_session uuid,p_from uuid,p_to uuid,p_policy jsonb,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old lzc.application_template_versions; target lzc.application_template_versions; edge lzc.application_upgrade_edges;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF p_confirm IS DISTINCT FROM true OR p_policy NOT IN ('{"sensitive":"approval-required"}'::jsonb,'{"sensitive":"direct"}'::jsonb) THEN RAISE EXCEPTION 'application_upgrade_confirmation_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM lzc.application_template_versions WHERE id=p_from AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO target FROM lzc.application_template_versions WHERE id=p_to AND tenant_id=lzc.current_tenant_id();
 IF old.id IS NULL OR target.id IS NULL OR old.template_id<>target.template_id OR target.version<=old.version OR old.document->>'kind' IS DISTINCT FROM target.document->>'kind'
  OR (old.deployment_policy='approval-required' AND target.deployment_policy='direct')
  OR (p_policy->>'sensitive'='direct' AND (old.deployment_policy<>'direct' OR target.deployment_policy<>'direct')) THEN RAISE EXCEPTION 'application_upgrade_edge_invalid' USING ERRCODE='42501'; END IF;
 INSERT INTO lzc.application_upgrade_edges(tenant_id,from_version_id,to_version_id,policy,published_by) VALUES(old.tenant_id,p_from,p_to,p_policy,lzc.current_user_id()) ON CONFLICT(tenant_id,from_version_id,to_version_id) DO NOTHING RETURNING * INTO edge;
 IF edge.id IS NULL THEN SELECT * INTO edge FROM lzc.application_upgrade_edges WHERE tenant_id=old.tenant_id AND from_version_id=p_from AND to_version_id=p_to;
  IF edge.policy<>p_policy THEN RAISE EXCEPTION 'application_upgrade_edge_changed' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('id',edge.id,'fromVersionId',edge.from_version_id,'toVersionId',edge.to_version_id,'policy',edge.policy,'publishedBy',edge.published_by,'createdAt',edge.created_at);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.publish_application_upgrade_edge(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.publish_application_upgrade_edge(uuid,uuid,uuid,jsonb,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.application_upgrade_context(p_session uuid,p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE origin lzc.application_instances; effective lzc.application_instances; candidate lzc.application_upgrade_candidates; target lzc.application_template_versions;
BEGIN
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 SELECT * INTO origin FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO effective FROM lzc_auth.effective_application_order(p_instance);
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO target FROM lzc.application_template_versions WHERE id=effective.version_id;
 RETURN jsonb_build_object('originVersionId',origin.version_id,'effectiveVersionId',effective.version_id,'effectivePlatformRevision',lzc_auth.effective_application_platform_revision(p_instance),
 'effectiveSettings',effective.resolved_settings,'effectiveParameters',effective.parameters,'effectiveDeploymentPolicy',effective.deployment_policy,'bindingId',candidate.id,
 'candidate',CASE WHEN candidate.id IS NULL THEN NULL ELSE jsonb_build_object('id',candidate.id,'kind',candidate.kind,'platformEdgeId',candidate.platform_edge_id,'candidateHash',candidate.candidate_hash,'edgeId',candidate.edge_id,'versionId',candidate.version_id,'platformRevision',candidate.platform_revision,'parameters',candidate.parameters,'resolvedSettings',candidate.resolved_settings,'sourceRevision',candidate.source_revision,'executionBindingId',candidate.execution_binding_id,'sensitivePolicy',candidate.sensitive_policy,'createdAt',candidate.created_at) END,
 'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'fromVersionId',e.from_version_id,'toVersionId',e.to_version_id,'policy',e.policy,'publishedBy',e.published_by,'createdAt',e.created_at)) FROM lzc.application_upgrade_edges e WHERE e.tenant_id=origin.tenant_id AND e.from_version_id=effective.version_id AND lzc_auth.application_template_group_access(origin.tenant_id,origin.requested_by,e.to_version_id)),'[]'),
 'blockers',lzc_auth.application_execution_blockers(p_instance),
 'lastAppliedPlatformRevision',(SELECT g.platform_revision FROM lzc.application_job_grants g JOIN lzc.application_jobs j ON j.id=g.job_id JOIN lzc.application_dispatches d ON d.job_id=j.id WHERE j.instance_id=p_instance AND j.operation='apply' AND d.status='succeeded' AND coalesce(j.inputs->>'purpose','standard')<>'destroy' ORDER BY d.finished_at DESC,j.id DESC LIMIT 1),
 'lastAppliedVersionId',(SELECT g.version_id FROM lzc.application_job_grants g JOIN lzc.application_jobs j ON j.id=g.job_id JOIN lzc.application_dispatches d ON d.job_id=j.id WHERE j.instance_id=p_instance AND j.operation='apply' AND d.status='succeeded' AND coalesce(j.inputs->>'purpose','standard')<>'destroy' ORDER BY d.finished_at DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.request_application_upgrade(p_session uuid,p_instance uuid,p_edge uuid,p_expected_binding uuid,p_expected_version uuid,p_parameters jsonb,p_confirm boolean) RETURNS jsonb
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
 IF target.accelerator_revision<>source THEN
  IF EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=source AND replacement_revision=target.accelerator_revision AND status IN ('supported','withdrawn')) THEN
   PERFORM lzc_auth.upgrade_application_execution(p_session,p_instance,target.accelerator_revision,source,true); source:=target.accelerator_revision;
  ELSIF NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=target.accelerator_revision AND replacement_revision=source AND status='supported') THEN RAISE EXCEPTION 'application_upgrade_source_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=source AND status='supported') THEN RAISE EXCEPTION 'application_upgrade_source_unavailable' USING ERRCODE='42501'; END IF;
 SELECT id INTO execution_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 snapshot:=jsonb_build_object('instanceId',p_instance,'edgeId',edge.id,'versionId',target.id,'platformRevision',target.platform_revision,'parameters',parameters,'resolvedSettings',settings,'deploymentPolicy',policy,'sourceRevision',source,'executionBindingId',execution_binding,'sensitivePolicy',edge.policy->>'sensitive');
 UPDATE lzc.application_job_grants g SET revoked_at=coalesce(g.revoked_at,now()) FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance AND j.operation='plan' AND g.revoked_at IS NULL;
 INSERT INTO lzc.application_upgrade_candidates(id,tenant_id,instance_id,sequence,edge_id,previous_binding_id,version_id,platform_revision,parameters,resolved_settings,deployment_policy,source_revision,execution_binding_id,candidate_hash,requested_by,issuer_session_id,sensitive_policy)
 VALUES(candidate_id,ordered.tenant_id,p_instance,coalesce(current_candidate.sequence,0)+1,edge.id,current_candidate.id,target.id,target.platform_revision,parameters,settings,policy,source,execution_binding,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),ordered.requested_by,p_session,edge.policy->>'sensitive');
 RETURN lzc_auth.application_upgrade_context(p_session,p_instance);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.assert_application_upgrade_plan(p_plan uuid,p_sha text,p_require_approval boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; candidate lzc.application_upgrade_candidates; edge lzc.application_upgrade_edges; artifact lzc.application_runner_records; summary jsonb;
BEGIN
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_plan;
 IF job.inputs->>'applicationUpgradeId' IS NULL OR coalesce(job.inputs->>'purpose','standard')<>'standard' THEN RETURN; END IF;
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=(job.inputs->>'applicationUpgradeId')::uuid AND instance_id=job.instance_id;
 SELECT * INTO edge FROM lzc.application_upgrade_edges WHERE id=candidate.edge_id;
 SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_plan AND kind='artifact' AND sha256=p_sha;
 summary:=artifact.summary;
 IF candidate.id IS NULL OR artifact.job_id IS NULL OR summary->>'completeness' IS DISTINCT FROM 'complete'
  OR summary#>>'{resources,delete}' IS DISTINCT FROM '0' OR summary#>>'{resources,replace}' IS DISTINCT FROM '0'
  OR summary->>'destructive' IS DISTINCT FROM 'false' OR summary#>>'{upgradeSafety,classification}' NOT IN ('ordinary','sensitive')
  OR summary#>>'{upgradeSafety,classification}' IS NULL OR jsonb_typeof(summary#>'{upgradeSafety,reasons}') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(summary#>'{upgradeSafety,reasons}','[]')) r WHERE r->>'classification'='blocked') THEN RAISE EXCEPTION 'application_upgrade_plan_blocked' USING ERRCODE='42501'; END IF;
 IF p_require_approval AND (candidate.deployment_policy='approval-required' OR (summary#>>'{upgradeSafety,classification}'='sensitive' AND candidate.sensitive_policy='approval-required'))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_upgrade_approvals a JOIN lzc.memberships m ON m.tenant_id=a.tenant_id AND m.user_id=a.approved_by
    JOIN lzc.application_platform_contracts c ON c.revision=candidate.platform_revision AND c.tenant_id=a.tenant_id
    WHERE a.candidate_id=candidate.id AND a.plan_id=job.id AND a.artifact_sha256=p_sha AND a.binding_sha256=job.binding_sha256 AND a.candidate_hash=candidate.candidate_hash AND a.approved_by<>candidate.requested_by
    AND 'platform-engineer'=ANY(m.product_roles) AND a.approved_by=c.approved_by) THEN RAISE EXCEPTION 'application_upgrade_plan_approval_required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_upgrade_plan(uuid,text,boolean) FROM PUBLIC;

CREATE FUNCTION lzc_auth.approve_application_upgrade(p_session uuid,p_candidate uuid,p_hash text,p_plan uuid,p_sha text,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate lzc.application_upgrade_candidates; planned lzc.application_jobs; artifact lzc.application_runner_records; receipt lzc.application_upgrade_approvals;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=p_candidate AND tenant_id=lzc.current_tenant_id();
 IF candidate.id IS NULL OR p_confirm IS DISTINCT FROM true OR candidate.candidate_hash<>p_hash OR candidate.requested_by=lzc.current_user_id() THEN RAISE EXCEPTION 'application_upgrade_approval_invalid' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM lzc.application_instances WHERE id=candidate.instance_id FOR UPDATE;
 IF candidate.id IS DISTINCT FROM (SELECT id FROM lzc.application_upgrade_candidates WHERE instance_id=candidate.instance_id ORDER BY sequence DESC LIMIT 1)
  OR NOT EXISTS(SELECT 1 FROM lzc.application_platform_contracts WHERE revision=candidate.platform_revision AND approved_by=lzc.current_user_id() AND tenant_id=candidate.tenant_id) THEN RAISE EXCEPTION 'application_upgrade_approval_invalid' USING ERRCODE='42501'; END IF;
 SELECT * INTO planned FROM lzc.application_jobs WHERE id=p_plan AND instance_id=candidate.instance_id AND operation='plan' AND inputs->>'applicationUpgradeId'=candidate.id::text;
 SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_plan AND kind='artifact' AND sha256=p_sha;
 IF planned.id IS NULL OR artifact.job_id IS NULL OR NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=p_plan AND d.status='succeeded' AND d.summary=artifact.summary AND d.finished_at>now()-interval '1 hour')
  OR EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=candidate.instance_id AND newer.operation='plan' AND (newer.created_at,newer.id)>(planned.created_at,planned.id)) THEN RAISE EXCEPTION 'application_upgrade_approval_invalid' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.assert_application_upgrade_plan(p_plan,p_sha,false);
 INSERT INTO lzc.application_upgrade_approvals(candidate_id,plan_id,tenant_id,candidate_hash,binding_sha256,artifact_sha256,approved_by,issuer_session_id)
 VALUES(candidate.id,planned.id,candidate.tenant_id,p_hash,planned.binding_sha256,p_sha,lzc.current_user_id(),p_session) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM lzc.application_upgrade_approvals WHERE candidate_id=candidate.id AND plan_id=planned.id;
 IF receipt.artifact_sha256<>p_sha OR receipt.candidate_hash<>p_hash THEN RAISE EXCEPTION 'application_upgrade_approval_invalid' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('candidateId',receipt.candidate_id,'planId',receipt.plan_id,'artifactSha256',receipt.artifact_sha256,'approvedBy',receipt.approved_by,'createdAt',receipt.created_at);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.approve_application_upgrade(uuid,uuid,text,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.approve_application_upgrade(uuid,uuid,text,uuid,text,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.assert_application_upgrade_binding(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; current_id uuid;
BEGIN
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 PERFORM 1 FROM lzc.application_instances WHERE id=job.instance_id FOR UPDATE;
 SELECT id INTO current_id FROM lzc.application_upgrade_candidates WHERE instance_id=job.instance_id ORDER BY sequence DESC LIMIT 1;
 IF job.inputs->>'applicationUpgradeId' IS DISTINCT FROM current_id::text THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_upgrade_binding(uuid) FROM PUBLIC;
CREATE FUNCTION lzc.guard_application_upgrade_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_id uuid; candidate lzc.application_upgrade_candidates; ordered lzc.application_instances; published lzc.application_template_versions; contract lzc.application_platform_contracts; app jsonb; expected_contract jsonb; expected_app jsonb;
BEGIN
 PERFORM 1 FROM lzc.application_instances WHERE id=NEW.instance_id FOR UPDATE;
 SELECT id INTO current_id FROM lzc.application_upgrade_candidates WHERE instance_id=NEW.instance_id ORDER BY sequence DESC LIMIT 1;
 IF NEW.inputs->>'applicationUpgradeId' IS DISTINCT FROM current_id::text THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='42501'; END IF;
 IF current_id IS NOT NULL THEN
  SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=current_id;
  SELECT * INTO ordered FROM lzc.application_instances WHERE id=NEW.instance_id;
  SELECT * INTO published FROM lzc.application_template_versions WHERE id=candidate.version_id;
  SELECT * INTO contract FROM lzc.application_platform_contracts WHERE revision=candidate.platform_revision;
  app:=NEW.inputs#>'{variables,application}';
  expected_contract:=contract.document||jsonb_build_object('targets',jsonb_build_object(published.target_key,contract.document#>ARRAY['targets',published.target_key]));
  expected_app:=jsonb_build_object('configurator_execution',true,'tenant_id',NEW.tenant_id,'instance_id',NEW.instance_id,
   'name',ordered.name,'owner_email',candidate.resolved_settings->>'owner_email','platform_revision',candidate.platform_revision,
   'template_id','template-'||(published.document->>'id'),'template_version',published.version,'target_key',published.target_key,
   'env',candidate.resolved_settings->'env','network_enabled',coalesce(candidate.resolved_settings->'network_enabled','false'::jsonb),
   'network_prefix_length',coalesce(candidate.resolved_settings->'network_prefix_length','null'::jsonb),
   'secretsmanager_enabled',coalesce(candidate.resolved_settings->'secretsmanager_enabled','false'::jsonb),
   'observability',jsonb_build_object('enabled',coalesce(candidate.resolved_settings#>'{observability,enabled}','false'::jsonb),
    'plan_name',coalesce(candidate.resolved_settings#>'{observability,plan_name}',to_jsonb('Observability-Starter-'||upper(published.document->>'region'))),
    'acl',coalesce(candidate.resolved_settings#>'{observability,acl}','[]'::jsonb)),
   'custom_roles',coalesce(candidate.resolved_settings->'custom_roles','[]'::jsonb),
   'role_assignments',coalesce(candidate.resolved_settings->'role_assignments','[]'::jsonb));
  IF candidate.resolved_settings ? 'automation_role' THEN expected_app:=expected_app||jsonb_build_object('automation_role',candidate.resolved_settings->'automation_role'); END IF;
  IF candidate.resolved_settings ? 'initial_owner_email' THEN expected_app:=expected_app||jsonb_build_object('initial_owner_email',candidate.resolved_settings->'initial_owner_email'); END IF;
  IF app IS DISTINCT FROM expected_app THEN RAISE EXCEPTION 'application_upgrade_inputs_mismatch' USING ERRCODE='42501'; END IF;
  IF app->>'configurator_execution' IS DISTINCT FROM 'true' OR NEW.inputs->>'applyPolicy' IS DISTINCT FROM candidate.deployment_policy
   OR NEW.inputs->>'requestedBy' IS DISTINCT FROM NEW.owner_user_id::text
   OR NEW.inputs->>'stateKey' IS DISTINCT FROM 'applications/'||NEW.tenant_id::text||'/'||NEW.instance_id::text||'/terraform.tfstate'
   OR app->>'tenant_id' IS DISTINCT FROM NEW.tenant_id::text OR app->>'instance_id' IS DISTINCT FROM NEW.instance_id::text
   OR app->>'name' IS DISTINCT FROM ordered.name OR app->>'owner_email' IS DISTINCT FROM candidate.resolved_settings->>'owner_email'
   OR app->>'platform_revision' IS DISTINCT FROM candidate.platform_revision::text
   OR app->>'template_id' IS DISTINCT FROM 'template-'||(published.document->>'id') OR app->>'template_version' IS DISTINCT FROM published.version::text
   OR app->>'target_key' IS DISTINCT FROM published.target_key OR app->'env' IS DISTINCT FROM candidate.resolved_settings->'env'
   OR app->'network_enabled' IS DISTINCT FROM coalesce(candidate.resolved_settings->'network_enabled','false'::jsonb)
   OR app->'network_prefix_length' IS DISTINCT FROM coalesce(candidate.resolved_settings->'network_prefix_length','null'::jsonb)
   OR NEW.inputs#>'{variables,platform_contract}' IS DISTINCT FROM expected_contract THEN RAISE EXCEPTION 'application_upgrade_inputs_mismatch' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.operation='apply' THEN PERFORM lzc_auth.assert_application_upgrade_plan(NEW.plan_id,NEW.artifact_sha256,true); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_upgrade_binding() FROM PUBLIC;
CREATE TRIGGER application_upgrade_binding BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_upgrade_binding();

-- Admission reads the selected desired snapshot. Running jobs and Recovery read
-- their own immutable snapshot, even after later desired revisions are selected.
DO $$ DECLARE definition text; signature text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc.issue_application_job_grant()'::regprocedure);
 anchor:='SELECT * INTO i FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id AND requested_by=NEW.owner_user_id;';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_upgrade_grant_anchor_missing'; END IF;
 definition:=replace(definition,anchor,'SELECT * INTO i FROM lzc_auth.application_job_order(NEW.id) WHERE tenant_id=NEW.tenant_id AND requested_by=NEW.owner_user_id;');
 EXECUTE replace(definition,'revision=v.platform_revision','revision=lzc_auth.application_job_platform_revision(NEW.id)');
 FOREACH signature IN ARRAY ARRAY['lzc.validate_application_access_inputs()','lzc.guard_application_job_group()'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id','FROM lzc_auth.application_order_snapshot(NEW.instance_id,(NEW.inputs->>''applicationUpgradeId'')::uuid) WHERE tenant_id=NEW.tenant_id');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('lzc_auth.assert_application_job_group(uuid)'::regprocedure);
 anchor:='FROM lzc.application_instances WHERE id=job.instance_id';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_upgrade_group_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,'FROM lzc_auth.application_job_order(p_job)');
 definition:=pg_get_functiondef('lzc_auth.delegated_application_plan_context(uuid,uuid)'::regprocedure);
 anchor:='FROM lzc.application_instances WHERE id=grant_row.instance_id AND tenant_id=grant_row.tenant_id';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_upgrade_context_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,'FROM lzc_auth.application_job_order(p_job) WHERE tenant_id=grant_row.tenant_id');
 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_recovery_replan_context(uuid,uuid)','lzc_auth.guided_application_recovery_base_context(uuid,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id';
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_upgrade_recovery_anchor_missing'; END IF;
  definition:=replace(definition,anchor,'JOIN lzc.application_template_versions v ON v.id=grant_row.version_id AND v.tenant_id=i.tenant_id');
  EXECUTE replace(definition,'c.revision=v.platform_revision','c.revision=grant_row.platform_revision');
 END LOOP;
 definition:=pg_get_functiondef('lzc_auth.resolve_application_runner_ticket(text,uuid,text,text)'::regprocedure);
 EXECUTE replace(definition,'instance.version_id','(lzc_auth.application_job_order(job.id)).version_id');
 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_execution_context(uuid,uuid)','lzc_auth.upgrade_application_execution(uuid,uuid,text,text,boolean)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  EXECUTE replace(definition,'ordered.requested_by,ordered.version_id','ordered.requested_by,(lzc_auth.effective_application_order(ordered.id)).version_id');
 END LOOP;
 definition:=pg_get_functiondef('lzc_auth.assert_application_execution_binding(uuid)'::regprocedure);
 EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n PERFORM lzc_auth.assert_application_upgrade_binding(p_job);\n');
 -- Even direct SQL Apply insertion and revalidated running-Apply context must
 -- preserve the upgrade's fresh artifact/safety approval, not a previous order approval.
 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_apply_plan(uuid,uuid,text)','lzc_auth.application_running_apply_plan(uuid,uuid,text,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n PERFORM lzc_auth.assert_application_upgrade_plan(p_plan,p_sha,true);\n');
 END LOOP;
END $$;

CREATE FUNCTION lzc_auth.application_upgrade_approval_context(p_session uuid,p_plan uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; candidate lzc.application_upgrade_candidates; artifact lzc.application_runner_records;
 required boolean; approved boolean; allowed boolean; blockers jsonb:='[]';
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_plan AND tenant_id=lzc.current_tenant_id() AND operation='plan';
 IF job.id IS NULL OR (job.owner_user_id<>lzc.current_user_id() AND NOT lzc.application_role('platform-engineer')) THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO candidate FROM lzc.application_upgrade_candidates WHERE id=(job.inputs->>'applicationUpgradeId')::uuid AND instance_id=job.instance_id;
 SELECT * INTO artifact FROM lzc.application_runner_records WHERE job_id=p_plan AND kind='artifact';
 IF candidate.id IS NULL THEN RETURN jsonb_build_object('upgradeId',NULL,'candidateHash',NULL,'artifactSha256',NULL,'requiresApproval',false,'approved',false,'canApprove',false,'blocked',false,'blockers','[]'::jsonb); END IF;
 required:=candidate.deployment_policy='approval-required' OR (artifact.summary#>>'{upgradeSafety,classification}'='sensitive' AND candidate.sensitive_policy='approval-required');
 BEGIN
  PERFORM lzc_auth.assert_application_upgrade_plan(p_plan,artifact.sha256,false);
 EXCEPTION WHEN insufficient_privilege THEN blockers:=blockers||'"application_upgrade_plan_blocked"'::jsonb;
 END;
 IF candidate.id IS DISTINCT FROM (SELECT id FROM lzc.application_upgrade_candidates WHERE instance_id=job.instance_id ORDER BY sequence DESC LIMIT 1)
  OR NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=p_plan AND d.status='succeeded' AND d.summary=artifact.summary AND d.finished_at>now()-interval '1 hour')
  OR EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=job.instance_id AND newer.operation='plan' AND (newer.created_at,newer.id)>(job.created_at,job.id)) THEN blockers:=blockers||'"application_upgrade_plan_stale"'::jsonb; END IF;
 approved:=EXISTS(SELECT 1 FROM lzc.application_upgrade_approvals a JOIN lzc.memberships m ON m.user_id=a.approved_by AND m.tenant_id=a.tenant_id
  JOIN lzc.application_platform_contracts c ON c.revision=candidate.platform_revision AND c.tenant_id=a.tenant_id AND c.approved_by=a.approved_by
  WHERE a.candidate_id=candidate.id AND a.plan_id=job.id AND a.candidate_hash=candidate.candidate_hash AND a.binding_sha256=job.binding_sha256 AND a.artifact_sha256=artifact.sha256 AND a.approved_by<>candidate.requested_by AND 'platform-engineer'=ANY(m.product_roles));
 allowed:=jsonb_array_length(blockers)=0 AND candidate.requested_by<>lzc.current_user_id() AND lzc.application_role('platform-engineer') AND EXISTS(SELECT 1 FROM lzc.application_platform_contracts WHERE revision=candidate.platform_revision AND approved_by=lzc.current_user_id() AND tenant_id=candidate.tenant_id);
 RETURN jsonb_build_object('upgradeId',candidate.id,'candidateHash',candidate.candidate_hash,'artifactSha256',artifact.sha256,'requiresApproval',coalesce(required,true),'approved',approved,'canApprove',allowed,'blocked',jsonb_array_length(blockers)>0,'blockers',blockers);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_approval_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_approval_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc.guard_application_upgrade_artifact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs;
BEGIN
 SELECT * INTO job FROM lzc.application_jobs WHERE id=NEW.job_id;
 IF NEW.kind='artifact' AND job.inputs->>'applicationUpgradeId' IS NOT NULL AND coalesce(job.inputs->>'purpose','standard')='standard' THEN
  IF NEW.summary#>>'{upgradeSafety,classification}' IS NULL OR NEW.summary#>>'{upgradeSafety,classification}' NOT IN ('ordinary','sensitive','blocked')
   OR jsonb_typeof(NEW.summary#>'{upgradeSafety,reasons}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'application_upgrade_summary_required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_upgrade_artifact() FROM PUBLIC;
CREATE TRIGGER upgrade_artifact_summary BEFORE INSERT ON lzc.application_runner_records FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_upgrade_artifact();

-- Every desired/historical snapshot is durable usage, even after another upgrade.
CREATE OR REPLACE FUNCTION lzc.application_template_deletable(p_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc.application_role('platform-engineer') AND EXISTS(
 SELECT 1 FROM lzc.application_template_retirements r WHERE r.tenant_id=lzc.current_tenant_id() AND r.version_id=p_version
 AND NOT EXISTS(SELECT 1 FROM lzc.application_template_deletions d WHERE d.tenant_id=r.tenant_id AND d.version_id=r.version_id)
 AND NOT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.tenant_id=r.tenant_id AND i.version_id=r.version_id)
 AND NOT EXISTS(SELECT 1 FROM lzc.application_upgrade_candidates c WHERE c.tenant_id=r.tenant_id AND c.version_id=r.version_id));
$$;
DO $$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.delete_application_template(uuid,uuid)'::regprocedure);
 anchor:='IF EXISTS(SELECT 1 FROM lzc.application_instances WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version) THEN';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'upgrade_template_deletion_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,'IF EXISTS(SELECT 1 FROM lzc.application_instances WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version) OR EXISTS(SELECT 1 FROM lzc.application_upgrade_candidates WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version) THEN');
END $$;

CREATE FUNCTION lzc.guard_application_upgrade_availability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:'||NEW.tenant_id::text||':'||NEW.version_id::text,0));
 IF (NEW.kind='template' AND EXISTS(SELECT 1 FROM lzc.application_template_retirements WHERE tenant_id=NEW.tenant_id AND version_id=NEW.version_id))
 OR EXISTS(SELECT 1 FROM lzc.application_template_deletions WHERE tenant_id=NEW.tenant_id AND version_id=NEW.version_id)
 THEN RAISE EXCEPTION 'application_upgrade_target_unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_upgrade_availability() FROM PUBLIC;
CREATE TRIGGER upgrade_availability BEFORE INSERT ON lzc.application_upgrade_candidates FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_upgrade_availability();

CREATE INDEX application_upgrade_candidate_version_usage ON lzc.application_upgrade_candidates(tenant_id,version_id);
