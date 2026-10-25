-- Extend immutable intent receipts for explicitly approved lost-secret revocation.
-- No infrastructure creation occurs here. State publication keeps its existing guards.
ALTER TABLE lzc.application_state_recovery_intents DROP CONSTRAINT application_state_recovery_intents_step_check;
ALTER TABLE lzc.application_state_recovery_intents ADD CONSTRAINT application_state_recovery_intents_step_check CHECK(step IN ('unlock','publish') OR step ~ '^revoke:[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION lzc_auth.fence_application_state_recovery(p_session uuid,p_task uuid,p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks; added integer;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR t.mode<>'commit' OR t.input_released_at IS NULL OR t.finished_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR (p_step NOT IN ('unlock','publish') AND p_step !~ '^revoke:[a-f0-9]{64}$') THEN RETURN false; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 IF p_step LIKE 'revoke:%' AND EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step IN ('unlock','publish')) THEN RETURN false; END IF;
 IF p_step='publish' AND NOT EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step='unlock') THEN RETURN false; END IF;
 INSERT INTO lzc.application_state_recovery_intents(task_id,step) VALUES(p_task,p_step) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RETURN added=1;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.inspect_application_state_recovery_task(p_session uuid,p_task uuid,p_phase text,p_private bytea,p_view jsonb,p_input_released boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks; r lzc.application_state_recoveries;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE id=t.recovery_id FOR UPDATE;
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task FOR UPDATE;
 IF (t.input_released_at IS NOT NULL) IS DISTINCT FROM p_input_released OR NOT (
  (t.mode='prepare' AND r.phase='assessing' AND t.finished_at IS NULL AND p_phase='blocked') OR
  (t.mode='commit' AND r.phase IN ('committing','reconciliation-required') AND
   ((p_phase='committed' AND EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step='publish')) OR
    (p_phase='blocked' AND (t.input_released_at IS NULL OR NOT EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step IN ('unlock','publish')))) OR
    (p_phase='reconciliation-required' AND r.phase='committing')))) THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 IF t.finished_at IS NULL THEN
  UPDATE lzc.application_state_recovery_tasks SET finished_at=clock_timestamp() WHERE id=p_task;
 END IF;
 INSERT INTO lzc.application_state_recovery_receipts(task_id,phase,review_session_id,reviewed_by,private_ciphertext,public_view)
 VALUES(p_task,p_phase,p_session,lzc.current_user_id(),p_private,p_view);
 UPDATE lzc.application_state_recoveries SET phase=p_phase,private_ciphertext=p_private,public_view=p_view WHERE id=t.recovery_id;
END $$;

CREATE FUNCTION lzc_auth.application_state_recovery_has_state_intent(p_session uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 RETURN EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step IN ('unlock','publish'));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_state_recovery_has_state_intent(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_state_recovery_has_state_intent(uuid,uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc.guard_application_state_recovery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['phase','expires_at','public_view','private_ciphertext']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['phase','expires_at','public_view','private_ciphertext']) OR NOT (
  (OLD.phase='requested' AND NEW.phase IN ('assessing','blocked')) OR
  (OLD.phase='assessing' AND NEW.phase IN ('prepared','blocked')) OR
  (OLD.phase='prepared' AND NEW.phase IN ('committing','blocked')) OR
  (OLD.phase='committing' AND NEW.phase IN ('committed','reconciliation-required','blocked')) OR
  (OLD.phase='reconciliation-required' AND NEW.phase IN ('committed','blocked'))) THEN
  RAISE EXCEPTION 'immutable_application_state_recovery' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
