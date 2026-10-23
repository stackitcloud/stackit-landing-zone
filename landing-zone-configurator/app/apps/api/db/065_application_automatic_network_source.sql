-- Allow the reviewed Corporate automatic-prefix source for new jobs.
-- Existing template versions, jobs, State keys and backend delegations remain unchanged.
ALTER TABLE lzc.application_job_grants DROP CONSTRAINT application_job_grants_accelerator_revision_check;
ALTER TABLE lzc.application_job_grants ADD CONSTRAINT application_job_grants_accelerator_revision_check
 CHECK(accelerator_revision IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f','9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d'));
ALTER TABLE lzc.application_runner_tickets DROP CONSTRAINT application_runner_tickets_accelerator_revision_check;
ALTER TABLE lzc.application_runner_tickets ADD CONSTRAINT application_runner_tickets_accelerator_revision_check
 CHECK(accelerator_revision IN ('c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f','57ad1f6a651c1787694b74ff8aa8b241a3dcd16f','9e7fb46c329aca32e878ce1f0ea3b944ea240354','1ed855609d4dcbfded6759c7c8b4fabf7bd6725d'));

DO $$
DECLARE signature text; definition text; old_source text := '''9e7fb46c329aca32e878ce1f0ea3b944ea240354''';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'lzc.issue_application_job_grant()',
  'lzc_auth.reserve_application_dispatch(uuid,uuid)',
  'lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'
 ] LOOP
  definition := pg_get_functiondef(signature::regprocedure);
  IF strpos(definition,old_source)=0 THEN RAISE EXCEPTION 'application_source_guard_missing'; END IF;
  EXECUTE replace(definition,old_source,old_source || ',''1ed855609d4dcbfded6759c7c8b4fabf7bd6725d''');
 END LOOP;
END $$;
