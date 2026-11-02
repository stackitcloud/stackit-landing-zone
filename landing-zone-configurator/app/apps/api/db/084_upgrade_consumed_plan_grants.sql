-- A claimed Plan grant is immutable even after the Runner has completed.
-- Keep that historical receipt; claim uniqueness and current binding checks
-- prevent reuse. Only unclaimed Plans can and must be revoked on an upgrade.
-- Active Runner/claim/Recovery gates remain in each original function.
DO $$
DECLARE signature regprocedure; definition text; anchor text :=
 'AND j.operation=''plan'' AND g.revoked_at IS NULL;';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'lzc_auth.upgrade_application_execution(uuid,uuid,text,text,boolean)'::regprocedure,
  'lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)'::regprocedure,
  'lzc_auth.request_application_platform_upgrade(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure
 ] LOOP
  definition:=pg_get_functiondef(signature);
  IF position(anchor IN definition)=0 THEN
   RAISE EXCEPTION 'upgrade_plan_revocation_anchor_missing';
  END IF;
  EXECUTE replace(definition,anchor,
   'AND j.operation=''plan'' AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM lzc.application_job_claims consumed WHERE consumed.job_id=g.job_id);');
 END LOOP;
END $$;
