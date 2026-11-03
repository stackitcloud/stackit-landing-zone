-- An upgrade path owns its execution policy. Publications are immutable:
-- changing a path policy appends a new edge; existing candidates/Plans keep theirs.
DO $migration$ DECLARE rel text; fields text[]; constraint_name text;
BEGIN
 FOR rel,fields IN SELECT * FROM (VALUES
 ('application_upgrade_edges',ARRAY['tenant_id','from_version_id','to_version_id']),
 ('application_platform_upgrade_edges',ARRAY['tenant_id','from_revision','to_revision'])) x LOOP
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid=to_regclass('lzc.'||rel) AND contype='u'
   AND conkey=ARRAY(SELECT attnum FROM unnest(fields) WITH ORDINALITY f(name,n) JOIN pg_attribute a ON a.attrelid=to_regclass('lzc.'||rel) AND a.attname=f.name ORDER BY n)::smallint[];
  EXECUTE format('ALTER TABLE lzc.%I DROP CONSTRAINT %I',rel,constraint_name);
 END LOOP;
END $migration$;
CREATE INDEX application_upgrade_edge_latest ON lzc.application_upgrade_edges(tenant_id,from_version_id,to_version_id,created_at DESC,id DESC);
CREATE INDEX application_platform_upgrade_edge_latest ON lzc.application_platform_upgrade_edges(tenant_id,from_revision,to_revision,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION lzc_auth.publish_application_upgrade_edge(p_session uuid,p_from uuid,p_to uuid,p_policy jsonb,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old lzc.application_template_versions; target lzc.application_template_versions; edge lzc.application_upgrade_edges;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF p_confirm IS DISTINCT FROM true OR p_policy NOT IN ('{"sensitive":"approval-required"}'::jsonb,'{"sensitive":"direct"}'::jsonb) THEN RAISE EXCEPTION 'application_upgrade_confirmation_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM lzc.application_template_versions WHERE id=p_from AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO target FROM lzc.application_template_versions WHERE id=p_to AND tenant_id=lzc.current_tenant_id();
 IF old.id IS NULL OR target.id IS NULL OR old.template_id<>target.template_id OR target.version<=old.version OR old.document->>'kind' IS DISTINCT FROM target.document->>'kind' THEN RAISE EXCEPTION 'application_upgrade_edge_invalid' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application_upgrade_edges:'||old.tenant_id::text||':'||p_from::text||':'||p_to::text,0));
 SELECT * INTO edge FROM lzc.application_upgrade_edges WHERE tenant_id=old.tenant_id AND from_version_id=p_from AND to_version_id=p_to ORDER BY created_at DESC,id DESC LIMIT 1;
 IF edge.id IS NULL OR edge.policy IS DISTINCT FROM p_policy THEN
  INSERT INTO lzc.application_upgrade_edges(tenant_id,from_version_id,to_version_id,policy,published_by) VALUES(old.tenant_id,p_from,p_to,p_policy,lzc.current_user_id()) RETURNING * INTO edge;
 END IF;
 RETURN jsonb_build_object('id',edge.id,'fromVersionId',edge.from_version_id,'toVersionId',edge.to_version_id,'policy',edge.policy,'publishedBy',edge.published_by,'createdAt',edge.created_at);
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.publish_application_platform_upgrade_edge(p_session uuid,p_from uuid,p_to uuid,p_policy jsonb,p_confirm boolean) RETURNS jsonb
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
 PERFORM pg_advisory_xact_lock(hashtextextended('application_platform_upgrade_edges:'||old.tenant_id::text||':'||p_from::text||':'||p_to::text,0));
 SELECT * INTO edge FROM lzc.application_platform_upgrade_edges WHERE tenant_id=old.tenant_id AND from_revision=p_from AND to_revision=p_to ORDER BY created_at DESC,id DESC LIMIT 1;
 IF edge.id IS NULL OR edge.policy IS DISTINCT FROM p_policy THEN
  INSERT INTO lzc.application_platform_upgrade_edges(tenant_id,from_revision,to_revision,policy,published_by) VALUES(old.tenant_id,p_from,p_to,p_policy,lzc.current_user_id()) RETURNING * INTO edge;
 END IF;
 RETURN jsonb_build_object('id',edge.id,'fromPlatformRevision',edge.from_revision,'toPlatformRevision',edge.to_revision,'policy',edge.policy,'publishedBy',edge.published_by,'createdAt',edge.created_at);
END $$;

DO $migration$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)'::regprocedure);
 anchor:=$anchor$policy:=CASE WHEN ordered.deployment_policy='approval-required' OR target.deployment_policy='approval-required' THEN 'approval-required' ELSE 'direct' END;$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_0_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$policy:=edge.policy->>'sensitive';$replacement$);
 definition:=pg_get_functiondef('lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)'::regprocedure);
 anchor:=$anchor$ SELECT * INTO old FROM lzc.application_template_versions WHERE id=ordered.version_id;$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_1_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$ PERFORM pg_advisory_xact_lock(hashtextextended('application_upgrade_edges:'||ordered.tenant_id::text||':'||edge.from_version_id::text||':'||edge.to_version_id::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_upgrade_edges newer WHERE newer.tenant_id=edge.tenant_id AND newer.from_version_id=edge.from_version_id AND newer.to_version_id=edge.to_version_id AND (newer.created_at,newer.id)>(edge.created_at,edge.id)) THEN RAISE EXCEPTION 'application_upgrade_edge_unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO old FROM lzc.application_template_versions WHERE id=ordered.version_id;$replacement$);
 definition:=pg_get_functiondef('lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure);
 anchor:=$anchor$ SELECT * INTO old FROM lzc.application_platform_contracts WHERE revision=edge.from_revision;$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_2_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$ PERFORM pg_advisory_xact_lock(hashtextextended('application_platform_upgrade_edges:'||ordered.tenant_id::text||':'||edge.from_revision::text||':'||edge.to_revision::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_platform_upgrade_edges newer WHERE newer.tenant_id=edge.tenant_id AND newer.from_revision=edge.from_revision AND newer.to_revision=edge.to_revision AND (newer.created_at,newer.id)>(edge.created_at,edge.id)) THEN RAISE EXCEPTION 'application_upgrade_edge_unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO old FROM lzc.application_platform_contracts WHERE revision=edge.from_revision;$replacement$);
 definition:=pg_get_functiondef('lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure);
 anchor:=$anchor$
  OR (edge.policy->>'sensitive'='direct' AND ordered.deployment_policy<>'direct')$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_3_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$$replacement$);
 definition:=pg_get_functiondef('lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure);
 anchor:=$anchor$ snapshot:=jsonb_build_object('instanceId'$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_4_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$ ordered.deployment_policy:=edge.policy->>'sensitive';
 snapshot:=jsonb_build_object('instanceId'$replacement$);
 definition:=pg_get_functiondef('lzc.issue_application_job_grant()'::regprocedure);
 anchor:=$anchor$(i.deployment_policy IS DISTINCT FROM v.deployment_policy AND NOT (NEW.inputs->>'applicationUpgradeId' IS NOT NULL AND i.deployment_policy='approval-required' AND v.deployment_policy='direct'))$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_5_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$(i.deployment_policy IS DISTINCT FROM v.deployment_policy AND NOT EXISTS(SELECT 1 FROM lzc.application_upgrade_candidates selected WHERE selected.id=(NEW.inputs->>'applicationUpgradeId')::uuid AND selected.instance_id=NEW.instance_id AND selected.tenant_id=NEW.tenant_id AND selected.deployment_policy=i.deployment_policy))$replacement$);
 definition:=pg_get_functiondef('lzc_auth.application_upgrade_context(uuid,uuid)'::regprocedure);
 anchor:=$anchor$e.from_version_id=effective.version_id$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_6_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$e.from_version_id=effective.version_id AND NOT EXISTS(SELECT 1 FROM lzc.application_upgrade_edges newer WHERE newer.tenant_id=e.tenant_id AND newer.from_version_id=e.from_version_id AND newer.to_version_id=e.to_version_id AND (newer.created_at,newer.id)>(e.created_at,e.id))$replacement$);
 definition:=pg_get_functiondef('lzc_auth.application_upgrade_context(uuid,uuid)'::regprocedure);
 anchor:=$anchor$e.from_revision=lzc_auth.effective_application_platform_revision(p_instance)$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'upgrade_path_policy_anchor_7_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$e.from_revision=lzc_auth.effective_application_platform_revision(p_instance) AND NOT EXISTS(SELECT 1 FROM lzc.application_platform_upgrade_edges newer WHERE newer.tenant_id=e.tenant_id AND newer.from_revision=e.from_revision AND newer.to_revision=e.to_revision AND (newer.created_at,newer.id)>(e.created_at,e.id))$replacement$);
END $migration$;
