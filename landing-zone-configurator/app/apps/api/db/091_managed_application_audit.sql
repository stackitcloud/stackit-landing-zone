-- Admit the reviewed audit-capable native source; all historical roots remain
-- supported. No existing order, source binding, State or approval is rewritten.
INSERT INTO lzc.application_execution_sources(revision,provider_lock_sha256,tofu_version,contract_version,status)
VALUES('c83f3d910ab20131d1cba898023317c0e818843b','d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5','1.12.6',1,'supported');
UPDATE lzc.application_execution_sources SET replacement_revision='c83f3d910ab20131d1cba898023317c0e818843b' WHERE revision<>'c83f3d910ab20131d1cba898023317c0e818843b';

DO $$
DECLARE table_name text; constraint_name text; definition text; signature text;
 old_source text := '''08ac257de1548c8ec5e83dae1a79373711c3d644'''; new_source text := '''c83f3d910ab20131d1cba898023317c0e818843b''';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['application_job_grants','application_runner_tickets'] LOOP
  constraint_name:=table_name || '_accelerator_revision_check';
  SELECT pg_get_constraintdef(c.oid) INTO definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='lzc' AND t.relname=table_name AND c.conname=constraint_name;
  IF definition IS NULL OR strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'audit_source_constraint_missing'; END IF;
  EXECUTE format('ALTER TABLE lzc.%I DROP CONSTRAINT %I',table_name,constraint_name);
  EXECUTE format('ALTER TABLE lzc.%I ADD CONSTRAINT %I %s',table_name,constraint_name,replace(definition,old_source,old_source || ',' || new_source));
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'lzc.issue_application_job_grant()',
  'lzc_auth.reserve_application_dispatch(uuid,uuid)',
  'lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)',
  'lzc_auth.application_execution_compatibility_valid(uuid,jsonb)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'audit_source_function_guard_missing: %',signature; END IF;
  EXECUTE replace(definition,old_source,old_source || ',' || new_source);
 END LOOP;
 definition:=pg_get_functiondef('lzc.validate_application_access_inputs()'::regprocedure);
 IF strpos(definition,'NEW.inputs->>''acceleratorRevision'' IS DISTINCT FROM ' || old_source)=0 THEN RAISE EXCEPTION 'audit_access_source_guard_missing'; END IF;
 EXECUTE replace(definition,'NEW.inputs->>''acceleratorRevision'' IS DISTINCT FROM ' || old_source,
  'coalesce(NEW.inputs->>''acceleratorRevision'','''') NOT IN (' || old_source || ',' || new_source || ')');
END $$;

CREATE FUNCTION lzc.validate_application_audit_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; contract lzc.application_platform_contracts; expected jsonb; actual jsonb; target_key text;
BEGIN
 SELECT * INTO ordered FROM lzc_auth.application_order_snapshot(NEW.instance_id,(NEW.inputs->>'applicationUpgradeId')::uuid);
 SELECT * INTO contract FROM lzc.application_platform_contracts WHERE revision=(NEW.inputs#>>'{variables,platform_contract,revision}')::uuid AND tenant_id=NEW.tenant_id;
 SELECT v.target_key INTO target_key FROM lzc.application_template_versions v WHERE v.id=ordered.version_id AND v.tenant_id=NEW.tenant_id;
 expected:=contract.document#>ARRAY['targets',target_key,'audit_router'];
 actual:=NEW.inputs#>ARRAY['variables','platform_contract','targets',target_key,'audit_router'];
 IF expected IS DISTINCT FROM actual OR (expected IS NOT NULL AND expected<>'null'::jsonb AND NEW.inputs->>'acceleratorRevision' IS DISTINCT FROM 'c83f3d910ab20131d1cba898023317c0e818843b') THEN
  RAISE EXCEPTION 'application_audit_binding_mismatch' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.validate_application_audit_inputs() FROM PUBLIC;
CREATE TRIGGER validate_application_audit_inputs BEFORE INSERT ON lzc.application_jobs
 FOR EACH ROW EXECUTE FUNCTION lzc.validate_application_audit_inputs();

-- An approved audit handoff includes the required technical source transition.
-- Use the existing fenced upgrade function; do not silently run old native roots.
DO $$
DECLARE signature text; definition text; anchor text; contract_name text; target_key_expression text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)',
  'lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='SELECT id INTO execution_binding FROM lzc.application_execution_bindings WHERE instance_id=p_instance ORDER BY sequence DESC LIMIT 1;';
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'audit_upgrade_source_anchor_missing: %',signature; END IF;
  contract_name:=CASE WHEN signature LIKE '%request_application_platform_upgrade%' THEN 'target' ELSE 'target_contract' END;
  target_key_expression:=CASE WHEN signature LIKE '%request_application_platform_upgrade%' THEN 'target_key' ELSE 'target.target_key' END;
  EXECUTE replace(definition,anchor,format($transition$
 IF coalesce(%s.document#>ARRAY['targets',%s,'audit_router'],'null'::jsonb)<>'null'::jsonb AND source<>'c83f3d910ab20131d1cba898023317c0e818843b' THEN
  PERFORM lzc_auth.upgrade_application_execution(p_session,p_instance,'c83f3d910ab20131d1cba898023317c0e818843b',source,true);
  source:=lzc_auth.effective_application_revision(p_instance);
 END IF;
 %s
 $transition$,contract_name,target_key_expression,anchor));
 END LOOP;
END $$;
