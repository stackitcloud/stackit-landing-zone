-- New publications may opt into fixed Application access profiles. Existing
-- publications, instances, resource identities and grants remain unchanged.
ALTER TABLE lzc.application_job_grants DROP CONSTRAINT application_job_grants_accelerator_revision_check;
ALTER TABLE lzc.application_job_grants ADD CONSTRAINT application_job_grants_accelerator_revision_check
 CHECK(accelerator_revision IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f','9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d','08ac257de1548c8ec5e83dae1a79373711c3d644'));
ALTER TABLE lzc.application_runner_tickets DROP CONSTRAINT application_runner_tickets_accelerator_revision_check;
ALTER TABLE lzc.application_runner_tickets ADD CONSTRAINT application_runner_tickets_accelerator_revision_check
 CHECK(accelerator_revision IN ('c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f','9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d','08ac257de1548c8ec5e83dae1a79373711c3d644'));

DO $$
DECLARE signature text; definition text; old_source text := '''1ed855609d4dcbfded6759c7c8b4fabf7bd6725d''';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'lzc.issue_application_job_grant()',
  'lzc_auth.reserve_application_dispatch(uuid,uuid)',
  'lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'application_source_guard_missing'; END IF;
  EXECUTE replace(definition,old_source,old_source || ',''08ac257de1548c8ec5e83dae1a79373711c3d644''');
 END LOOP;
END $$;

CREATE FUNCTION lzc.validate_application_access_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; profile jsonb; app jsonb; expected_roles jsonb; expected_definitions jsonb;
BEGIN
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id;
 SELECT document->'accessProfile' INTO profile FROM lzc.application_template_versions WHERE id=ordered.version_id AND tenant_id=NEW.tenant_id;
 IF profile IS NULL THEN RETURN NEW; END IF;
 app:=NEW.inputs#>'{variables,application}';
 IF profile->>'schemaVersion' IS DISTINCT FROM '1' OR NEW.inputs->>'acceleratorRevision' IS DISTINCT FROM '08ac257de1548c8ec5e83dae1a79373711c3d644' OR
    app->>'owner_email' IS DISTINCT FROM ordered.resolved_settings->>'owner_email' THEN
  RAISE EXCEPTION 'application_access_profile_mismatch' USING ERRCODE='42501';
 END IF;
 IF profile->>'mode'='granular' THEN
  expected_roles:=jsonb_build_array(jsonb_build_object('role','application-workload','subject',ordered.resolved_settings->>'owner_email'));
  expected_definitions:=jsonb_build_array(
   jsonb_build_object('name','application-workload','description','Versioned Application team workload permissions','permissions',profile->'permissions'),
   jsonb_build_object('name','application-automation','description','Versioned Application workload automation permissions','permissions',profile->'automationPermissions'));
  IF app->>'initial_owner_email' IS DISTINCT FROM profile->>'initialOwnerEmail' OR
     lower(app->>'initial_owner_email')=lower(app->>'owner_email') OR app->>'automation_role' IS DISTINCT FROM 'application-automation' OR
     app->'role_assignments' IS DISTINCT FROM expected_roles OR app->'custom_roles' IS DISTINCT FROM expected_definitions OR
     ordered.resolved_settings->>'initial_owner_email' IS DISTINCT FROM profile->>'initialOwnerEmail' OR
     ordered.resolved_settings->>'automation_role' IS DISTINCT FROM 'application-automation' OR
     ordered.resolved_settings->'role_assignments' IS DISTINCT FROM expected_roles OR ordered.resolved_settings->'custom_roles' IS DISTINCT FROM expected_definitions THEN
   RAISE EXCEPTION 'application_access_profile_mismatch' USING ERRCODE='42501';
  END IF;
 ELSIF profile->>'mode'='owner' THEN
  IF app->>'initial_owner_email' IS NOT NULL OR app->>'automation_role' IS DISTINCT FROM 'owner' OR
     app->'role_assignments' IS DISTINCT FROM '[]'::jsonb OR app->'custom_roles' IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'application_access_profile_mismatch' USING ERRCODE='42501';
  END IF;
 ELSE RAISE EXCEPTION 'application_access_profile_mismatch' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.validate_application_access_inputs() FROM PUBLIC;
CREATE TRIGGER validate_application_access_inputs BEFORE INSERT ON lzc.application_jobs
 FOR EACH ROW EXECUTE FUNCTION lzc.validate_application_access_inputs();

-- Complete the verified requester assignment after login without rebinding the
-- initial project owner, chosen permissions, source, State key or prior jobs.
DO $$
DECLARE definition text; marker text := 'role_policy:=published.document#>''{parameterPolicy,fields,role_assignments}'';';
BEGIN
 definition:=pg_get_functiondef('lzc_auth.complete_application_order_identity(uuid,uuid,jsonb)'::regprocedure);
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'application_identity_completion_guard_missing'; END IF;
 EXECUTE replace(definition,marker,$replacement$
 IF published.document#>>'{accessProfile,mode}'='granular' THEN
  expected_settings:=jsonb_set(expected_settings,'{role_assignments}',jsonb_build_array(jsonb_build_object('role','application-workload','subject',human.email)));
 END IF;
 role_policy:=published.document#>'{parameterPolicy,fields,role_assignments}';
 $replacement$);
END $$;
