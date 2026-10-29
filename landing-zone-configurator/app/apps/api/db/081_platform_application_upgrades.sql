-- Shared Platform impact is reviewed before Apply; an Application binding cannot
-- postpone real shared firewall/network changes to a later per-Application upgrade.
CREATE TABLE lzc.platform_application_impact_acknowledgements (
 plan_id uuid NOT NULL REFERENCES lzc.plan_runs(id), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 dependency_hash text NOT NULL CHECK(dependency_hash ~ '^[a-f0-9]{64}$'),
 state_key text NOT NULL REFERENCES lzc.platform_states(state_key), state_version bigint NOT NULL,
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id), issuer_session_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(plan_id,artifact_sha256,dependency_hash,approved_by,issuer_session_id)
);
ALTER TABLE lzc.platform_application_impact_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.platform_application_impact_acknowledgements FORCE ROW LEVEL SECURITY;
CREATE POLICY impact_ack_read ON lzc.platform_application_impact_acknowledgements FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY impact_ack_migration ON lzc.platform_application_impact_acknowledgements TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.platform_application_impact_acknowledgements TO configurator_app;
CREATE TRIGGER immutable_impact_ack BEFORE UPDATE OR DELETE ON lzc.platform_application_impact_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE TABLE lzc.platform_application_apply_guards (
 run_id uuid PRIMARY KEY REFERENCES lzc.plan_runs(id) DEFERRABLE INITIALLY DEFERRED,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),plan_id uuid NOT NULL REFERENCES lzc.plan_runs(id),
 artifact_sha256 text NOT NULL,dependency_hash text NOT NULL,state_key text NOT NULL,state_version bigint NOT NULL,
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),issuer_session_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE lzc.platform_application_apply_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.platform_application_apply_guards FORCE ROW LEVEL SECURITY;
CREATE POLICY apply_guard_read ON lzc.platform_application_apply_guards FOR SELECT TO configurator_app USING(tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY apply_guard_migration ON lzc.platform_application_apply_guards TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.platform_application_apply_guards TO configurator_app;
CREATE TRIGGER immutable_apply_guard BEFORE UPDATE OR DELETE ON lzc.platform_application_apply_guards FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

-- Internal inventory bypasses AO row visibility only after the public caller has
-- proved fresh PE membership. Unknown imported source attribution stays visible.
CREATE FUNCTION lzc_auth.platform_application_dependencies(p_tenant uuid,p_state text,p_organization uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('instanceId',i.id,'name',i.name,'targetKey',v.target_key,
 'versionId',v.id,'platformRevision',c.revision,'bindingId',(SELECT id FROM lzc.application_upgrade_candidates WHERE instance_id=i.id ORDER BY sequence DESC LIMIT 1),
 'lastJobId',(SELECT id FROM lzc.application_jobs WHERE instance_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1),
 'blockers',lzc_auth.application_execution_blockers(i.id)) ORDER BY i.id),'[]'::jsonb)
 FROM lzc.application_instances i
 JOIN lzc.application_template_versions v ON v.id=(lzc_auth.effective_application_order(i.id)).version_id AND v.tenant_id=i.tenant_id
 JOIN lzc.application_platform_contracts c ON c.revision=lzc_auth.effective_application_platform_revision(i.id) AND c.tenant_id=i.tenant_id
 LEFT JOIN lzc.application_platform_sources source ON source.revision=c.revision AND source.tenant_id=c.tenant_id
 WHERE i.tenant_id=p_tenant AND (source.state_key=p_state OR (source.revision IS NULL AND c.organization_id=p_organization))
 AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=i.id AND deleted.tenant_id=i.tenant_id AND (
  NOT EXISTS(SELECT 1 FROM lzc.application_jobs job WHERE job.instance_id=i.id AND job.operation='apply') OR EXISTS(
   SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches dispatch ON dispatch.job_id=job.id
   WHERE job.instance_id=i.id AND job.operation='apply' AND job.inputs->>'purpose'='destroy' AND dispatch.status='succeeded' AND dispatch.finished_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=i.id AND newer.operation='apply' AND (newer.created_at,newer.id)>(job.created_at,job.id))
  )
 ));
$$;
REVOKE ALL ON FUNCTION lzc_auth.platform_application_dependencies(uuid,text,uuid) FROM PUBLIC;

CREATE FUNCTION lzc_auth.platform_application_impact(p_session uuid,p_plan uuid) RETURNS jsonb
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
   OR artifact.summary->>'destructive' IS DISTINCT FROM 'false' OR artifact.summary#>>'{resources,delete}' IS DISTINCT FROM '0' OR artifact.summary#>>'{resources,replace}' IS DISTINCT FROM '0'
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
 'blockers',blockers,'acknowledged',acknowledged,'canAcknowledge',classification='sensitive' AND jsonb_array_length(blockers)=0 AND NOT acknowledged);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.platform_application_impact(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.platform_application_impact(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.acknowledge_platform_application_impact(p_session uuid,p_plan uuid,p_sha text,p_dependencies text,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; artifact lzc.plan_artifacts;
BEGIN
 context:=lzc_auth.platform_application_impact(p_session,p_plan);
 IF p_confirm IS DISTINCT FROM true OR context->>'artifactSha256' IS DISTINCT FROM p_sha OR context->>'dependencyHash' IS DISTINCT FROM p_dependencies
  OR context->>'classification' IS DISTINCT FROM 'sensitive' OR jsonb_array_length(context->'blockers')<>0 THEN RAISE EXCEPTION 'platform_impact_changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO artifact FROM lzc.plan_artifacts WHERE run_id=p_plan;
 INSERT INTO lzc.platform_application_impact_acknowledgements(plan_id,tenant_id,artifact_sha256,dependency_hash,state_key,state_version,approved_by,issuer_session_id)
 VALUES(p_plan,lzc.current_tenant_id(),p_sha,p_dependencies,artifact.state_key,artifact.state_version,lzc.current_user_id(),p_session) ON CONFLICT DO NOTHING;
 RETURN lzc_auth.platform_application_impact(p_session,p_plan);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.acknowledge_platform_application_impact(uuid,uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.acknowledge_platform_application_impact(uuid,uuid,text,text,boolean) TO configurator_app;

CREATE FUNCTION lzc.guard_platform_application_impact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE deps jsonb; organization uuid; artifact lzc.plan_artifacts; context jsonb; approval lzc.platform_application_impact_acknowledgements;
BEGIN
 IF NEW.operation<>'apply' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-application-impact:'||NEW.tenant_id::text,0));
 SELECT (manifest->'organization'->>'id')::uuid INTO organization FROM lzc.deployment_preparations WHERE id=NEW.preparation_id;
 deps:=lzc_auth.platform_application_dependencies(NEW.tenant_id,NEW.state_key,organization);
 IF jsonb_array_length(deps)=0 THEN RETURN NEW; END IF;
 SELECT * INTO artifact FROM lzc.plan_artifacts WHERE run_id=NEW.plan_id;
 IF NEW.artifact_sha256 IS DISTINCT FROM artifact.sha256 OR NEW.state_key IS DISTINCT FROM artifact.state_key OR NEW.state_version IS DISTINCT FROM artifact.state_version
  OR NEW.tenant_id IS DISTINCT FROM artifact.tenant_id OR NEW.owner_user_id IS DISTINCT FROM artifact.owner_user_id THEN RAISE EXCEPTION 'platform_impact_changed' USING ERRCODE='42501'; END IF;
 -- Ordinary plans need no extra approval; a real sensitive change needs a live
 -- acknowledgement from this exact PE session and immutable dependency set.
 SELECT * INTO approval FROM lzc.platform_application_impact_acknowledgements
 WHERE plan_id=NEW.plan_id AND artifact_sha256=artifact.sha256 AND dependency_hash=encode(sha256(convert_to(deps::text,'UTF8')),'hex')
  AND approved_by=NEW.owner_user_id ORDER BY created_at DESC LIMIT 1;
 IF artifact.summary#>>'{platformImpact,classification}'='ordinary' THEN
  IF NOT EXISTS(SELECT 1 FROM lzc_auth.sessions s WHERE s.user_id=NEW.owner_user_id AND coalesce(s.active_tenant_id,s.tenant_id)=NEW.tenant_id AND s.expires_at>now()) THEN RAISE EXCEPTION 'platform_impact_changed' USING ERRCODE='42501'; END IF;
  SELECT id INTO approval.issuer_session_id FROM lzc_auth.sessions WHERE user_id=NEW.owner_user_id AND coalesce(active_tenant_id,tenant_id)=NEW.tenant_id AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
 END IF;
 IF approval.issuer_session_id IS NULL THEN RAISE EXCEPTION 'platform_impact_acknowledgement_required' USING ERRCODE='42501'; END IF;
 context:=lzc_auth.platform_application_impact(approval.issuer_session_id,NEW.plan_id);
 IF context->>'artifactSha256' IS DISTINCT FROM NEW.artifact_sha256 OR jsonb_array_length(context->'blockers')>0 OR context->>'classification'='blocked'
  OR (context->>'classification'='sensitive' AND context->>'acknowledged' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'platform_impact_acknowledgement_required' USING ERRCODE='42501'; END IF;
 INSERT INTO lzc.platform_application_apply_guards(run_id,tenant_id,plan_id,artifact_sha256,dependency_hash,state_key,state_version,approved_by,issuer_session_id)
 VALUES(NEW.id,NEW.tenant_id,NEW.plan_id,artifact.sha256,context->>'dependencyHash',artifact.state_key,artifact.state_version,NEW.owner_user_id,approval.issuer_session_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_platform_application_impact() FROM PUBLIC;
CREATE TRIGGER platform_application_impact BEFORE INSERT ON lzc.plan_runs FOR EACH ROW EXECUTE FUNCTION lzc.guard_platform_application_impact();

-- Serialize dependency mutations with the final shared Apply admission. Recovery
-- reports remain allowed; only a new execution/material capability is fenced.
CREATE FUNCTION lzc_auth.assert_application_platform_available(p_instance uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; contract lzc.application_platform_contracts; source_state text;
BEGIN
 SELECT * INTO ordered FROM lzc_auth.effective_application_order(p_instance);
 IF ordered.id IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-application-impact:'||ordered.tenant_id::text,0));
 SELECT * INTO contract FROM lzc.application_platform_contracts WHERE revision=lzc_auth.effective_application_platform_revision(p_instance);
 SELECT state_key INTO source_state FROM lzc.application_platform_sources WHERE revision=contract.revision;
 IF EXISTS(SELECT 1 FROM lzc.plan_runs run JOIN lzc.deployment_preparations p ON p.id=run.preparation_id
  WHERE run.tenant_id=ordered.tenant_id AND run.operation='apply' AND run.status IN ('starting','initializing','validating','planning','applying','recovery_required')
  AND (run.state_key=source_state OR (source_state IS NULL AND p.manifest->'organization'->>'id'=contract.organization_id::text))) THEN
  RAISE EXCEPTION 'application_platform_execution_active' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_platform_available(uuid) FROM PUBLIC;
CREATE FUNCTION lzc.guard_application_platform_available() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE instance uuid;
BEGIN
 IF TG_TABLE_NAME='application_instances' THEN instance:=NEW.id;
 ELSIF TG_TABLE_NAME='application_state_recovery_tasks' THEN SELECT instance_id INTO instance FROM lzc.application_state_recoveries WHERE id=NEW.recovery_id;
 ELSIF TG_TABLE_NAME IN ('application_jobs','application_upgrade_candidates','application_order_deletions','application_execution_bindings') THEN instance:=NEW.instance_id;
 ELSE SELECT instance_id INTO instance FROM lzc.application_jobs WHERE id=NEW.job_id; END IF;
 PERFORM lzc_auth.assert_application_platform_available(instance);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_platform_available() FROM PUBLIC;
CREATE TRIGGER shared_platform_available AFTER INSERT ON lzc.application_instances FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_upgrade_candidates FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_job_claims FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_state_recovery_tasks FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_order_deletions FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();

-- New bindings require a current, successful, unlocked Platform proof. Existing
-- orders may retain older references; selecting a stale target is never implicit.
CREATE FUNCTION lzc_auth.application_platform_contract_current(p_revision uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source lzc.application_platform_sources; state lzc.platform_states;
BEGIN
 SELECT * INTO source FROM lzc.application_platform_sources WHERE revision=p_revision;
 IF source.revision IS NULL THEN RETURN false; END IF;
 SELECT * INTO state FROM lzc.platform_states WHERE state_key=source.state_key AND tenant_id=source.tenant_id FOR SHARE;
 RETURN state.state_key IS NOT NULL AND state.version=source.state_version AND state.lock_run_id IS NULL AND state.migration_run_id IS NULL AND state.pending_backend_id IS NULL
  AND EXISTS(SELECT 1 FROM lzc.plan_runs applied WHERE applied.id=source.apply_run_id AND applied.tenant_id=source.tenant_id AND applied.operation='apply' AND applied.status='succeeded' AND applied.applied_state_version=source.state_version AND applied.state_key=source.state_key)
  AND NOT EXISTS(SELECT 1 FROM lzc.plan_runs active WHERE active.tenant_id=source.tenant_id AND active.state_key=source.state_key AND active.operation='apply' AND active.status IN ('starting','initializing','validating','planning','applying','recovery_required'));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_platform_contract_current(uuid) FROM PUBLIC;
CREATE FUNCTION lzc_auth.application_upgrade_platform_current(p_session uuid,p_revision uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 IF NOT EXISTS(SELECT 1 FROM lzc.application_platform_contracts WHERE revision=p_revision AND tenant_id=lzc.current_tenant_id()) THEN RETURN false; END IF;
 RETURN lzc_auth.application_platform_contract_current(p_revision);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_upgrade_platform_current(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_upgrade_platform_current(uuid,uuid) TO configurator_app;
CREATE FUNCTION lzc.guard_application_upgrade_platform_current() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT lzc_auth.application_platform_contract_current(NEW.platform_revision) THEN RAISE EXCEPTION 'application_upgrade_platform_changed' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_upgrade_platform_current() FROM PUBLIC;
CREATE TRIGGER zz_upgrade_platform_current BEFORE INSERT ON lzc.application_upgrade_candidates FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_upgrade_platform_current();

CREATE TABLE lzc.application_platform_upgrade_edges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 from_revision uuid NOT NULL,to_revision uuid NOT NULL,policy jsonb NOT NULL,
 published_by uuid NOT NULL REFERENCES lzc_auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,from_revision) REFERENCES lzc.application_platform_contracts(tenant_id,revision),
 FOREIGN KEY(tenant_id,to_revision) REFERENCES lzc.application_platform_contracts(tenant_id,revision),
 CHECK(from_revision<>to_revision),CHECK(policy IN ('{"sensitive":"approval-required"}'::jsonb,'{"sensitive":"direct"}'::jsonb)),
 UNIQUE(tenant_id,from_revision,to_revision),UNIQUE(tenant_id,id)
);
ALTER TABLE lzc.application_platform_upgrade_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_platform_upgrade_edges FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_edge_read ON lzc.application_platform_upgrade_edges FOR SELECT TO configurator_app USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY platform_edge_migration ON lzc.application_platform_upgrade_edges TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_platform_upgrade_edges TO configurator_app;
CREATE TRIGGER immutable_platform_edge BEFORE UPDATE OR DELETE ON lzc.application_platform_upgrade_edges FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
ALTER TABLE lzc.application_upgrade_candidates ADD FOREIGN KEY(tenant_id,platform_edge_id) REFERENCES lzc.application_platform_upgrade_edges(tenant_id,id);

CREATE FUNCTION lzc_auth.publish_application_platform_upgrade_edge(p_session uuid,p_from uuid,p_to uuid,p_policy jsonb,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old lzc.application_platform_contracts; target lzc.application_platform_contracts; edge lzc.application_platform_upgrade_edges;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF p_confirm IS DISTINCT FROM true OR p_policy NOT IN ('{"sensitive":"approval-required"}'::jsonb,'{"sensitive":"direct"}'::jsonb) THEN RAISE EXCEPTION 'application_upgrade_confirmation_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM lzc.application_platform_contracts WHERE revision=p_from AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO target FROM lzc.application_platform_contracts WHERE revision=p_to AND tenant_id=lzc.current_tenant_id();
 IF old.revision IS NULL OR target.revision IS NULL OR old.revision=target.revision OR NOT lzc_auth.application_platform_contract_current(target.revision) OR old.organization_id<>target.organization_id OR target.approved_by<>lzc.current_user_id()
  OR NOT EXISTS(SELECT 1 FROM lzc.application_platform_sources a JOIN lzc.application_platform_sources b ON b.state_key=a.state_key AND b.tenant_id=a.tenant_id AND b.state_version>=a.state_version WHERE a.revision=old.revision AND b.revision=target.revision)
 THEN RAISE EXCEPTION 'application_platform_upgrade_edge_invalid' USING ERRCODE='42501'; END IF;
 INSERT INTO lzc.application_platform_upgrade_edges(tenant_id,from_revision,to_revision,policy,published_by) VALUES(old.tenant_id,old.revision,target.revision,p_policy,lzc.current_user_id()) ON CONFLICT(tenant_id,from_revision,to_revision) DO NOTHING RETURNING * INTO edge;
 IF edge.id IS NULL THEN SELECT * INTO edge FROM lzc.application_platform_upgrade_edges WHERE tenant_id=old.tenant_id AND from_revision=old.revision AND to_revision=target.revision;
  IF edge.policy<>p_policy THEN RAISE EXCEPTION 'application_upgrade_edge_changed' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('id',edge.id,'fromPlatformRevision',edge.from_revision,'toPlatformRevision',edge.to_revision,'policy',edge.policy,'publishedBy',edge.published_by,'createdAt',edge.created_at);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.publish_application_platform_upgrade_edge(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.publish_application_platform_upgrade_edge(uuid,uuid,uuid,jsonb,boolean) TO configurator_app;

CREATE FUNCTION lzc_auth.request_application_platform_upgrade(p_session uuid,p_instance uuid,p_edge uuid,p_expected_binding uuid,p_expected_revision uuid,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; current_candidate lzc.application_upgrade_candidates; edge lzc.application_platform_upgrade_edges;
 template lzc.application_template_versions; old lzc.application_platform_contracts; target lzc.application_platform_contracts;
 source text; execution_binding uuid; snapshot jsonb; candidate_id uuid:=gen_random_uuid(); target_key text;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM lzc_auth.require_active_application_order(p_session,p_instance);
 PERFORM lzc_auth.assert_application_platform_available(p_instance);
 SELECT * INTO ordered FROM lzc_auth.effective_application_order(p_instance);
 SELECT * INTO current_candidate FROM lzc.application_upgrade_candidates WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 IF ordered.requested_by<>lzc.current_user_id() OR p_confirm IS DISTINCT FROM true OR current_candidate.id IS DISTINCT FROM p_expected_binding OR lzc_auth.effective_application_platform_revision(p_instance) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'application_upgrade_binding_changed' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(lzc_auth.application_execution_blockers(p_instance))<>0 THEN RAISE EXCEPTION 'application_upgrade_execution_active' USING ERRCODE='40001'; END IF;
 SELECT * INTO template FROM lzc.application_template_versions WHERE id=ordered.version_id;
 IF NOT lzc_auth.application_template_group_access(ordered.tenant_id,ordered.requested_by,ordered.version_id) THEN RAISE EXCEPTION 'application_upgrade_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO edge FROM lzc.application_platform_upgrade_edges WHERE id=p_edge AND tenant_id=ordered.tenant_id AND from_revision=p_expected_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_platform_upgrade_edge_invalid' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM lzc.application_platform_contracts WHERE revision=edge.from_revision;
 SELECT * INTO target FROM lzc.application_platform_contracts WHERE revision=edge.to_revision;
 target_key:=template.target_key;
 IF NOT lzc_auth.application_platform_contract_current(target.revision) THEN RAISE EXCEPTION 'application_upgrade_platform_changed' USING ERRCODE='40001'; END IF;
 IF old.organization_id IS DISTINCT FROM target.organization_id OR target.tenant_id IS DISTINCT FROM ordered.tenant_id OR old.document#>ARRAY['targets',target_key] IS NULL OR target.document#>ARRAY['targets',target_key] IS NULL
  OR old.document#>ARRAY['targets',target_key,'folder_id'] IS DISTINCT FROM target.document#>ARRAY['targets',target_key,'folder_id']
  OR old.document#>ARRAY['targets',target_key,'region'] IS DISTINCT FROM target.document#>ARRAY['targets',target_key,'region']
  OR old.document#>ARRAY['targets',target_key,'corporate'] IS DISTINCT FROM target.document#>ARRAY['targets',target_key,'corporate']
  OR old.document#>ARRAY['targets',target_key,'network_area_id'] IS DISTINCT FROM target.document#>ARRAY['targets',target_key,'network_area_id']
  OR NOT EXISTS(SELECT 1 FROM lzc.application_execution_delegations a JOIN lzc.application_execution_delegations b ON b.backend_id=a.backend_id AND b.backend_identity=a.backend_identity AND b.backend_credentials_hash=a.backend_credentials_hash
   WHERE a.tenant_id=ordered.tenant_id AND b.tenant_id=a.tenant_id AND a.platform_revision=old.revision AND b.platform_revision=target.revision AND a.revoked_at IS NULL AND b.revoked_at IS NULL)
  OR (edge.policy->>'sensitive'='direct' AND ordered.deployment_policy<>'direct')
 THEN RAISE EXCEPTION 'application_upgrade_placement_changed' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.stackit_identities h WHERE h.user_id=ordered.requested_by AND h.issuer='https://accounts.stackit.cloud' AND h.valid_until>now() AND h.revoked_at IS NULL AND h.email=ordered.resolved_settings->>'owner_email') THEN RAISE EXCEPTION 'application_upgrade_identity_unavailable' USING ERRCODE='42501'; END IF;
 source:=lzc_auth.effective_application_revision(p_instance);
 IF NOT EXISTS(SELECT 1 FROM lzc.application_execution_sources WHERE revision=source AND status='supported') THEN RAISE EXCEPTION 'application_upgrade_source_unavailable' USING ERRCODE='42501'; END IF;
 SELECT id INTO execution_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;
 snapshot:=jsonb_build_object('instanceId',p_instance,'kind','platform','platformEdgeId',edge.id,'versionId',ordered.version_id,'platformRevision',target.revision,'parameters',ordered.parameters,'resolvedSettings',ordered.resolved_settings,'deploymentPolicy',ordered.deployment_policy,'sourceRevision',source,'executionBindingId',execution_binding,'sensitivePolicy',edge.policy->>'sensitive');
 UPDATE lzc.application_job_grants g SET revoked_at=coalesce(g.revoked_at,now()) FROM lzc.application_jobs j WHERE j.id=g.job_id AND j.instance_id=p_instance AND j.operation='plan' AND g.revoked_at IS NULL;
 INSERT INTO lzc.application_upgrade_candidates(id,tenant_id,instance_id,sequence,kind,platform_edge_id,previous_binding_id,version_id,platform_revision,parameters,resolved_settings,deployment_policy,source_revision,execution_binding_id,candidate_hash,requested_by,issuer_session_id,sensitive_policy)
 VALUES(candidate_id,ordered.tenant_id,p_instance,coalesce(current_candidate.sequence,0)+1,'platform',edge.id,current_candidate.id,ordered.version_id,target.revision,ordered.parameters,ordered.resolved_settings,ordered.deployment_policy,source,execution_binding,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),ordered.requested_by,p_session,edge.policy->>'sensitive');
 RETURN lzc_auth.application_upgrade_context(p_session,p_instance);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean) TO configurator_app;

DO $$ DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.application_upgrade_context(uuid,uuid)'::regprocedure);
 IF strpos(definition,'''lastAppliedVersionId''')=0 THEN RAISE EXCEPTION 'platform_upgrade_context_guard_missing'; END IF;
 EXECUTE replace(definition,'''lastAppliedVersionId''','''platformCandidates'',coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',e.id,''fromPlatformRevision'',e.from_revision,''toPlatformRevision'',e.to_revision,''policy'',e.policy,''publishedBy'',e.published_by,''createdAt'',e.created_at)) FROM lzc.application_platform_upgrade_edges e WHERE e.tenant_id=origin.tenant_id AND e.from_revision=lzc_auth.effective_application_platform_revision(p_instance)),''[]''::jsonb),''lastAppliedVersionId''');
END $$;

-- Opaque broker identities use their own run ID instead of a browser session.
-- The boolean never exposes foreign dependency names or material.
CREATE FUNCTION lzc_auth.platform_application_has_dependencies(p_session uuid,p_run uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run lzc.plan_runs; session_id uuid; organization uuid; present boolean;
BEGIN
 SELECT * INTO run FROM lzc.plan_runs WHERE id=p_run AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id();
 IF run.id IS NULL THEN RAISE EXCEPTION 'platform_impact_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF NOT lzc.deployment_role() THEN RAISE EXCEPTION 'platform_impact_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-application-impact:'||run.tenant_id::text,0));
 SELECT (manifest->'organization'->>'id')::uuid INTO organization FROM lzc.deployment_preparations WHERE id=run.preparation_id;
 present:=jsonb_array_length(lzc_auth.platform_application_dependencies(run.tenant_id,run.state_key,organization))>0;
 IF NOT present THEN RETURN false; END IF;
 session_id:=p_session;
 IF p_session=p_run THEN
  IF NOT run.input_claimed OR run.expires_at<=now() OR run.status NOT IN ('initializing','validating','planning','applying') THEN RAISE EXCEPTION 'platform_impact_access_denied' USING ERRCODE='42501'; END IF;
  SELECT id INTO session_id FROM lzc_auth.sessions WHERE user_id=run.owner_user_id AND coalesce(active_tenant_id,tenant_id)=run.tenant_id AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
 END IF;
 PERFORM lzc_auth.authorize_application(session_id,run.tenant_id,'publish');
 RETURN present;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.platform_application_has_dependencies(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.platform_application_has_dependencies(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.assert_platform_application_apply(p_run uuid,p_initial boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run lzc.plan_runs; guard lzc.platform_application_apply_guards; artifact lzc.plan_artifacts; state lzc.platform_states; dependencies jsonb; organization uuid;
BEGIN
 SELECT * INTO run FROM lzc.plan_runs WHERE id=p_run;
 IF run.operation IS DISTINCT FROM 'apply' THEN RETURN; END IF;
 SELECT (manifest->'organization'->>'id')::uuid INTO organization FROM lzc.deployment_preparations WHERE id=run.preparation_id;
 dependencies:=lzc_auth.platform_application_dependencies(run.tenant_id,run.state_key,organization);
 SELECT * INTO guard FROM lzc.platform_application_apply_guards WHERE run_id=run.id;
 IF jsonb_array_length(dependencies)=0 AND guard.run_id IS NULL THEN RETURN; END IF;
 SELECT * INTO artifact FROM lzc.plan_artifacts WHERE run_id=run.plan_id;
 SELECT * INTO state FROM lzc.platform_states WHERE state_key=run.state_key;
 IF guard.run_id IS NULL OR run.tenant_id<>lzc.current_tenant_id() OR run.owner_user_id<>lzc.current_user_id() OR run.expires_at<=now()
  OR run.status NOT IN ('starting','initializing','validating','planning','applying') OR artifact.sha256 IS DISTINCT FROM guard.artifact_sha256
  OR guard.plan_id IS DISTINCT FROM run.plan_id OR guard.state_key IS DISTINCT FROM run.state_key OR guard.state_version IS DISTINCT FROM run.state_version
  OR guard.dependency_hash IS DISTINCT FROM encode(sha256(convert_to(dependencies::text,'UTF8')),'hex')
  OR (state.lock_run_id IS NOT NULL AND state.lock_run_id<>p_run) OR (state.lock_run_id IS NULL AND state.version IS DISTINCT FROM guard.state_version)
  OR (p_initial AND state.version IS DISTINCT FROM guard.state_version)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies) d WHERE jsonb_array_length(d->'blockers')>0)
 THEN RAISE EXCEPTION 'platform_impact_changed' USING ERRCODE='42501'; END IF;
 -- Fresh browser authority is required to release new execution material.
 -- Checkpoint writes/unlock by the already-authorized, live locked run remain
 -- job-bound so browser logout cannot strand a valid native State checkpoint.
 IF p_initial THEN PERFORM lzc_auth.authorize_application(guard.issuer_session_id,run.tenant_id,'publish'); END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_platform_application_apply(uuid,boolean) FROM PUBLIC;
CREATE FUNCTION lzc.guard_platform_application_material() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run_id uuid;
BEGIN
 IF TG_TABLE_NAME='plan_runs' THEN
  IF OLD.input_claimed=false AND NEW.input_claimed=true THEN PERFORM lzc_auth.assert_platform_application_apply(NEW.id,true); END IF;
 ELSIF TG_TABLE_NAME='plan_credential_grants' THEN
  IF TG_OP='INSERT' OR (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL) THEN PERFORM lzc_auth.assert_platform_application_apply(NEW.run_id,true); END IF;
 ELSIF TG_TABLE_NAME='platform_states' THEN
  run_id:=coalesce(OLD.lock_run_id,NEW.lock_run_id);
  IF run_id IS NOT NULL THEN PERFORM lzc_auth.assert_platform_application_apply(run_id,OLD.lock_run_id IS NULL); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_platform_application_material() FROM PUBLIC;
CREATE TRIGGER platform_application_material BEFORE UPDATE OF input_claimed ON lzc.plan_runs FOR EACH ROW EXECUTE FUNCTION lzc.guard_platform_application_material();
CREATE TRIGGER platform_application_material BEFORE INSERT OR UPDATE OF consumed_at ON lzc.plan_credential_grants FOR EACH ROW EXECUTE FUNCTION lzc.guard_platform_application_material();
CREATE TRIGGER platform_application_material BEFORE UPDATE OF version,ciphertext,lock_run_id,lock_id ON lzc.platform_states FOR EACH ROW EXECUTE FUNCTION lzc.guard_platform_application_material();
CREATE TRIGGER shared_platform_available BEFORE INSERT ON lzc.application_execution_bindings FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();
CREATE TRIGGER shared_platform_material BEFORE UPDATE OF input_released_at,runner_app_id ON lzc.application_state_recovery_tasks FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_platform_available();

CREATE FUNCTION lzc_auth.application_platform_execution_blocked(p_instance uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_instances i
 JOIN lzc.application_platform_contracts c ON c.revision=lzc_auth.effective_application_platform_revision(i.id)
 LEFT JOIN lzc.application_platform_sources source ON source.revision=c.revision
 JOIN lzc.plan_runs run ON run.tenant_id=i.tenant_id AND run.operation='apply' AND run.status IN ('starting','initializing','validating','planning','applying','recovery_required')
 JOIN lzc.deployment_preparations p ON p.id=run.preparation_id
 WHERE i.id=p_instance AND (run.state_key=source.state_key OR (source.revision IS NULL AND p.manifest->'organization'->>'id'=c.organization_id::text)));
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_platform_execution_blocked(uuid) FROM PUBLIC;
DO $$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.application_upgrade_context(uuid,uuid)'::regprocedure);
 anchor:='lzc_auth.application_execution_blockers(p_instance)';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'platform_upgrade_context_guard_missing'; END IF;
 EXECUTE replace(definition,anchor,anchor||' || CASE WHEN lzc_auth.application_platform_execution_blocked(p_instance) THEN jsonb_build_array(''application-platform-execution-active'') ELSE ''[]''::jsonb END');
END $$;
