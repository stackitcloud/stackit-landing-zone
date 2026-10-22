-- Progress snapshots may change only while their bound dispatch is active.
-- Saved Plans and recovery evidence keep their existing immutability contract.
CREATE FUNCTION lzc.guard_application_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.kind='output' AND
  (to_jsonb(NEW)-ARRAY['ciphertext','sha256','truncated']) IS NOT DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['ciphertext','sha256','truncated']) AND EXISTS(
   SELECT 1 FROM lzc.application_dispatches d
   WHERE d.job_id=OLD.job_id AND d.tenant_id=OLD.tenant_id
    AND d.owner_user_id=OLD.owner_user_id AND d.runner_package_id=OLD.runner_package_id
    AND d.status IN ('starting','initializing','validating','planning','applying')
  ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'immutable_application_version' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_record() FROM PUBLIC;
DROP TRIGGER immutable_application_record ON lzc.application_runner_records;
CREATE TRIGGER immutable_application_record BEFORE UPDATE OR DELETE ON lzc.application_runner_records
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_record();

-- Keep all existing session, delegation, claim, ticket and dispatch checks.
-- Only the output case gains replacement; artifact/recovery conflicts still fail.
DO $$
DECLARE signature text; definition text; anchor text; replacement text;
BEGIN
 signature := 'lzc_auth.application_report_record(uuid,uuid,text,bytea,text,jsonb,boolean)';
 definition := pg_get_functiondef(signature::regprocedure);
 anchor := 'IF existing.sha256 IS DISTINCT FROM p_sha';
 replacement := 'IF p_kind=''output'' THEN
   UPDATE lzc.application_runner_records SET ciphertext=p_cipher,sha256=p_sha,truncated=p_truncated WHERE job_id=p_job AND kind=''output'';
   RETURN p_sha;
  END IF;
  ' || anchor;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_output_guard_missing'; END IF;
 EXECUTE replace(definition,anchor,replacement);
 FOREACH signature IN ARRAY ARRAY[
  'lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)',
  'lzc_auth.delegated_application_operation(uuid,uuid,text,jsonb)'
 ] LOOP
  definition := pg_get_functiondef(signature::regprocedure);
  anchor := 'IF existing.sha256 IS DISTINCT FROM p_input->>''sha''';
  replacement := 'IF p_input->>''kind''=''output'' THEN
    UPDATE lzc.application_runner_records SET ciphertext=decode(p_input->>''cipher'',''hex''),sha256=p_input->>''sha'',truncated=(p_input->>''truncated'')::boolean WHERE job_id=p_job AND kind=''output'';
    RETURN jsonb_build_object(''sha256'',p_input->>''sha'');
   END IF;
   ' || anchor;
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_output_guard_missing'; END IF;
  EXECUTE replace(definition,anchor,replacement);
 END LOOP;
END $$;
