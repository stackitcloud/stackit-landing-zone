INSERT INTO lzc.application_execution_sources(revision,provider_lock_sha256,tofu_version,contract_version,status)
 SELECT '2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a',provider_lock_sha256,tofu_version,contract_version,'supported'
 FROM lzc.application_execution_sources WHERE revision='c83f3d910ab20131d1cba898023317c0e818843b';
UPDATE lzc.application_execution_sources SET replacement_revision='2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a' WHERE revision<>'2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a';

DO $$
DECLARE table_name text; constraint_name text; definition text; signature text;
 old_source text := '''c83f3d910ab20131d1cba898023317c0e818843b'''; new_source text := '''2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a''';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['application_job_grants','application_runner_tickets'] LOOP
  constraint_name:=table_name||'_accelerator_revision_check';
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid=('lzc.'||table_name)::regclass AND conname=constraint_name;
  IF definition IS NULL OR strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'project_git_source_constraint_missing'; END IF;
  EXECUTE format('ALTER TABLE lzc.%I DROP CONSTRAINT %I',table_name,constraint_name);
  EXECUTE format('ALTER TABLE lzc.%I ADD CONSTRAINT %I %s',table_name,constraint_name,replace(definition,old_source,old_source||','||new_source));
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['lzc.issue_application_job_grant()','lzc_auth.reserve_application_dispatch(uuid,uuid)','lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)','lzc_auth.application_execution_compatibility_valid(uuid,jsonb)','lzc.validate_application_access_inputs()'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'project_git_source_guard_missing: %',signature; END IF;
  EXECUTE replace(definition,old_source,old_source||','||new_source);
 END LOOP;
 definition:=pg_get_functiondef('lzc.validate_application_audit_inputs()'::regprocedure);
 EXECUTE replace(definition,'NEW.inputs->>''acceleratorRevision'' IS DISTINCT FROM '||old_source,
  'coalesce(NEW.inputs->>''acceleratorRevision'','''') NOT IN ('||old_source||','||new_source||')');
 FOREACH signature IN ARRAY ARRAY['lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)','lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'source<>'||old_source,'source NOT IN ('||old_source||','||new_source||')');
  definition:=replace(definition,' THEN RAISE EXCEPTION ''application_upgrade_removal_blocked''',
   ' OR (coalesce(ordered.resolved_settings#>>''{git,enabled}'',''false'')=''true'' AND coalesce(settings#>>''{git,enabled}'',''false'')<>''true'') THEN RAISE EXCEPTION ''application_upgrade_removal_blocked''');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('lzc.guard_application_upgrade_binding()'::regprocedure);
 EXECUTE replace(definition,'  IF app IS DISTINCT FROM expected_app THEN',
  '  IF candidate.resolved_settings ? ''git'' THEN expected_app:=expected_app||jsonb_build_object(''git'',candidate.resolved_settings->''git''); END IF;'||chr(10)||'  IF app IS DISTINCT FROM expected_app THEN');
END $$;

-- Keep the database resolver equivalent to the domain parameter contract.
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.resolve_application_upgrade_settings(jsonb,jsonb,text)'::regprocedure);
 definition:=replace(definition,'"role_assignments":[]','"role_assignments":[],"git.enabled":false,"git.flavor":"git-10","git.acl":[]');
 definition:=replace(definition,'''observability.plan_name'') OR fields','''observability.plan_name'',''git.enabled'',''git.flavor'',''git.acl'') OR fields');
 definition:=replace(definition,'''observability.plan_name'',''role_assignments''] LOOP','''observability.plan_name'',''role_assignments'',''git.enabled'',''git.flavor'',''git.acl''] LOOP'||chr(10)||
  '  IF path LIKE ''git.%'' AND NOT settings ? ''git'' AND NOT fields ?| ARRAY[''git.enabled'',''git.flavor'',''git.acl''] THEN CONTINUE; END IF;');
 definition:=replace(definition,'  IF rule->>''source''=''input'' THEN','  IF path LIKE ''git.%'' AND path<>''git.enabled'' AND settings#>>''{git,enabled}'' IS DISTINCT FROM ''true'' THEN rule:=NULL; END IF;'||chr(10)||'  IF rule->>''source''=''input'' THEN');
 definition:=replace(definition,'rule->''choices'' @> jsonb_build_array(value)','rule->''choices'' @> CASE WHEN path=''git.acl'' THEN value ELSE jsonb_build_array(value) END');
 definition:=replace(definition,'path IN (''env'',''observability.plan_name'')','path IN (''env'',''observability.plan_name'',''git.flavor'')');
 definition:=replace(definition,'path IN (''secretsmanager_enabled'',''observability.enabled'')','path IN (''secretsmanager_enabled'',''observability.enabled'',''git.enabled'')');
 definition:=replace(definition,'path=''role_assignments'' AND','path IN (''role_assignments'',''git.acl'') AND');
 EXECUTE definition;
END $$;

CREATE FUNCTION lzc.validate_application_git_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; expected jsonb; actual jsonb; cidr text;
BEGIN
 SELECT * INTO ordered FROM lzc_auth.application_order_snapshot(NEW.instance_id,(NEW.inputs->>'applicationUpgradeId')::uuid);
 expected:=ordered.resolved_settings->'git'; actual:=NEW.inputs#>'{variables,application,git}';
 IF actual IS DISTINCT FROM expected OR (expected IS NOT NULL AND NEW.inputs->>'acceleratorRevision' IS DISTINCT FROM '2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a')
 THEN RAISE EXCEPTION 'application_git_binding_mismatch' USING ERRCODE='42501'; END IF;
 IF expected->>'enabled'='true' THEN
  IF coalesce(expected->>'flavor','') !~ '^git-[0-9]+$' OR jsonb_typeof(expected->'acl') IS DISTINCT FROM 'array' OR jsonb_array_length(expected->'acl')=0
  THEN RAISE EXCEPTION 'application_git_access_invalid' USING ERRCODE='42501'; END IF;
  FOR cidr IN SELECT jsonb_array_elements_text(expected->'acl') LOOP PERFORM cidr::inet; END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.validate_application_git_inputs() FROM PUBLIC;
CREATE TRIGGER validate_application_git_inputs BEFORE INSERT ON lzc.application_jobs
 FOR EACH ROW EXECUTE FUNCTION lzc.validate_application_git_inputs();
