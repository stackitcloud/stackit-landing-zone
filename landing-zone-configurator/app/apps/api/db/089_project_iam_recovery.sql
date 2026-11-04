-- Keep the frozen IAM transition with the authorized original Apply context.
-- Ciphertext is decrypted only inside the recovery service, never sent to clients.
DO $migration$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.application_state_recovery_context(uuid,uuid)'::regprocedure);
 anchor:=$anchor$'originalInputs',j.inputs,$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'project_iam_recovery_anchor_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$'originalInputs',j.inputs,
  'iamPlanArtifact',(SELECT jsonb_build_object('ciphertext',encode(a.ciphertext,'hex'),'sha256',a.sha256,'planId',p.id,'ownerUserId',p.owner_user_id)
   FROM lzc.application_jobs p JOIN lzc.application_runner_records a ON a.job_id=p.id AND a.kind='artifact'
   WHERE p.id=j.plan_id AND p.tenant_id=j.tenant_id AND a.sha256=j.artifact_sha256),$replacement$);
END $migration$;
