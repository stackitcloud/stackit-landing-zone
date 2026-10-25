-- A recovery request is not execution permission. Native State writes have
-- separate source/session-bound tasks and durable, single-use mutation intents.
CREATE TABLE lzc.application_state_recoveries (
 id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES lzc.application_jobs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 instance_id uuid NOT NULL REFERENCES lzc.application_instances(id),
 requested_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 reviewed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 idempotency_key uuid NOT NULL,
 phase text NOT NULL CHECK(phase IN ('requested','assessing','blocked','prepared','committing','committed','reconciliation-required')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 public_view jsonb NOT NULL CHECK(jsonb_typeof(public_view)='object' AND octet_length(public_view::text)<=262144),
 private_ciphertext bytea CHECK(private_ciphertext IS NULL OR octet_length(private_ciphertext)<=33554432),
 UNIQUE(tenant_id,requested_by,idempotency_key)
);
CREATE UNIQUE INDEX application_state_recovery_active ON lzc.application_state_recoveries(job_id)
 WHERE phase IN ('requested','assessing','prepared','committing','reconciliation-required');
CREATE TABLE lzc.application_state_recovery_tasks (
 id uuid PRIMARY KEY,
 recovery_id uuid NOT NULL REFERENCES lzc.application_state_recoveries(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 mode text NOT NULL CHECK(mode IN ('prepare','commit')),
 issuer_session_id uuid NOT NULL,
 issued_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 ticket_hash text NOT NULL UNIQUE CHECK(ticket_hash ~ '^[A-Za-z0-9_-]{43}$'),
 input_ciphertext bytea NOT NULL CHECK(octet_length(input_ciphertext)<=33554432),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 runner_app_id uuid,
 runner_package_id uuid,
 input_released_at timestamptz,
 finished_at timestamptz,
 UNIQUE(recovery_id,mode),
 CHECK((runner_app_id IS NULL)=(runner_package_id IS NULL))
);
CREATE TABLE lzc.application_state_recovery_intents (
 task_id uuid NOT NULL REFERENCES lzc.application_state_recovery_tasks(id),
 step text NOT NULL CHECK(step IN ('unlock','publish')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(task_id,step)
);
CREATE TABLE lzc.application_state_recovery_receipts (
 task_id uuid NOT NULL REFERENCES lzc.application_state_recovery_tasks(id),
 phase text NOT NULL CHECK(phase IN ('prepared','blocked','committed','reconciliation-required')),
 review_session_id uuid NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 private_ciphertext bytea NOT NULL CHECK(octet_length(private_ciphertext)<=33554432),
 public_view jsonb NOT NULL,
 PRIMARY KEY(task_id,phase)
);
ALTER TABLE lzc.application_state_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recoveries FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_state_recovery_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY application_state_recovery_read ON lzc.application_state_recoveries FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (((requested_by=lzc.current_user_id() OR owner_user_id=lzc.current_user_id()) AND
  (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer'))) OR
  (reviewed_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_state_recovery_task_read ON lzc.application_state_recovery_tasks FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND issued_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY application_state_recovery_migration ON lzc.application_state_recoveries TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_state_recovery_task_migration ON lzc.application_state_recovery_tasks TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_state_recovery_intent_migration ON lzc.application_state_recovery_intents TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_state_recovery_receipt_migration ON lzc.application_state_recovery_receipts TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_state_recoveries,lzc.application_state_recovery_tasks TO configurator_app;
CREATE TRIGGER immutable_application_state_recovery_intent BEFORE UPDATE OR DELETE ON lzc.application_state_recovery_intents
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
CREATE TRIGGER immutable_application_state_recovery_receipt BEFORE UPDATE OR DELETE ON lzc.application_state_recovery_receipts
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();
CREATE FUNCTION lzc.guard_application_state_recovery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['phase','expires_at','public_view','private_ciphertext']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['phase','expires_at','public_view','private_ciphertext']) OR NOT (
  (OLD.phase='requested' AND NEW.phase IN ('assessing','blocked')) OR
  (OLD.phase='assessing' AND NEW.phase IN ('prepared','blocked')) OR
  (OLD.phase='prepared' AND NEW.phase IN ('committing','blocked')) OR
  (OLD.phase='committing' AND NEW.phase IN ('committed','reconciliation-required','blocked')) OR
  (OLD.phase='reconciliation-required' AND NEW.phase='committed')) THEN
  RAISE EXCEPTION 'immutable_application_state_recovery' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_application_state_recovery BEFORE UPDATE OR DELETE ON lzc.application_state_recoveries
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_state_recovery();
CREATE FUNCTION lzc.guard_application_state_recovery_task() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.finished_at IS NOT NULL OR
  (to_jsonb(NEW)-ARRAY['runner_app_id','runner_package_id','input_released_at','finished_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['runner_app_id','runner_package_id','input_released_at','finished_at']) OR
  (OLD.runner_app_id IS NOT NULL AND NEW.runner_app_id IS DISTINCT FROM OLD.runner_app_id) OR
  (OLD.runner_package_id IS NOT NULL AND NEW.runner_package_id IS DISTINCT FROM OLD.runner_package_id) OR
  (OLD.input_released_at IS NOT NULL AND NEW.input_released_at IS DISTINCT FROM OLD.input_released_at) THEN
  RAISE EXCEPTION 'immutable_application_state_recovery_task' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_application_state_recovery_task BEFORE UPDATE OR DELETE ON lzc.application_state_recovery_tasks
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_state_recovery_task();

CREATE FUNCTION lzc_auth.request_application_state_recovery(p_session uuid,p_job uuid,p_id uuid,p_key uuid,p_view jsonb)
RETURNS lzc.application_state_recoveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j lzc.application_jobs; g lzc.application_job_grants; d lzc.application_dispatches; r lzc.application_state_recoveries;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 SELECT * INTO j FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job;
 PERFORM lzc_auth.require_active_application_order(p_session,j.instance_id);
 SELECT * INTO d FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 IF j.id IS NULL OR g.job_id IS NULL OR j.operation<>'apply' OR coalesce(j.inputs->>'purpose','standard')<>'standard'
  OR d.status IS DISTINCT FROM 'reconciliation_required' OR d.finished_at IS NULL
  OR NOT (j.owner_user_id=lzc.current_user_id() OR (g.approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')))
  OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery')
  OR EXISTS(SELECT 1 FROM lzc.application_recovery_replans WHERE job_id=p_job)
  OR EXISTS(SELECT 1 FROM lzc.application_jobs other WHERE other.instance_id=j.instance_id AND other.created_at>j.created_at) THEN
  RAISE EXCEPTION 'application_state_recovery_unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,j.instance_id);
 PERFORM lzc_auth.assert_application_job_group(p_job);
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE tenant_id=j.tenant_id AND requested_by=lzc.current_user_id() AND idempotency_key=p_key;
 IF FOUND THEN
  IF r.job_id<>p_job THEN RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
  RETURN r;
 END IF;
 -- Expired read-only proposals can be superseded. Uncertain/running writes cannot.
 UPDATE lzc.application_state_recoveries SET phase='blocked',public_view=public_view||jsonb_build_object('phase','blocked','blockers',jsonb_build_array('proposal-expired'))
 WHERE job_id=p_job AND phase IN ('requested','prepared') AND expires_at<=clock_timestamp();
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE job_id=p_job AND phase IN ('requested','assessing','prepared','committing','reconciliation-required');
 IF FOUND THEN RETURN r; END IF;
 INSERT INTO lzc.application_state_recoveries(id,job_id,tenant_id,instance_id,requested_by,owner_user_id,reviewed_by,idempotency_key,phase,expires_at,public_view)
 VALUES(p_id,p_job,j.tenant_id,j.instance_id,lzc.current_user_id(),j.owner_user_id,g.approved_by,p_key,'requested',clock_timestamp()+interval '24 hours',p_view) RETURNING * INTO r;
 RETURN r;
END $$;

CREATE FUNCTION lzc_auth.application_state_recovery_context(p_session uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r lzc.application_state_recoveries; c jsonb; j lzc.application_jobs; g lzc.application_job_grants; profile lzc.credential_profiles;
BEGIN
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE id=p_id AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND OR r.reviewed_by<>lzc.current_user_id() OR NOT lzc.application_role('platform-engineer') THEN
  RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 c:=lzc_auth.application_recovery_replan_context(p_session,r.job_id);
 IF c->>'mode'<>'operator-attested' OR c->'existingReceipt' IS DISTINCT FROM 'null'::jsonb
  OR EXISTS(SELECT 1 FROM lzc.application_jobs other JOIN lzc.application_jobs original ON original.id=r.job_id
   WHERE other.instance_id=original.instance_id AND other.created_at>original.created_at) THEN RAISE EXCEPTION 'application_state_recovery_unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO j FROM lzc.application_jobs WHERE id=r.job_id;
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=r.job_id;
 SELECT * INTO profile FROM lzc.credential_profiles WHERE id=g.credential_profile_id AND tenant_id=r.tenant_id AND owner_user_id=r.reviewed_by;
 IF profile.id IS NULL OR profile.state<>'stored' OR profile.key_id IS DISTINCT FROM g.credential_key_id
  OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=r.tenant_id AND user_id=j.owner_user_id AND
   ('application-owner'=ANY(product_roles) OR 'platform-engineer'=ANY(product_roles))) THEN
  RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 RETURN c || jsonb_build_object('recoveryId',r.id,'phase',r.phase,'originalInputs',j.inputs,
  'credentialProfileId',g.credential_profile_id,'credentialVersion',g.credential_version,'credentialKeyId',g.credential_key_id,
  'organizationId',g.organization_id,'sourceRevision',g.accelerator_revision,'ownerUserId',j.owner_user_id,
  'runnerPackageId',(SELECT runner_package_id FROM lzc.application_dispatches WHERE job_id=r.job_id),
  'originalCreatedAt',j.created_at);
END $$;

CREATE FUNCTION lzc_auth.begin_application_state_recovery_task(p_session uuid,p_id uuid,p_task uuid,p_mode text,p_hash text,p_private bytea,p_view jsonb)
RETURNS lzc.application_state_recovery_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb; r lzc.application_state_recoveries; t lzc.application_state_recovery_tasks; expires timestamptz;
BEGIN
 c:=lzc_auth.application_state_recovery_context(p_session,p_id);
 SELECT * INTO r FROM lzc.application_state_recoveries WHERE id=p_id FOR UPDATE;
 IF r.expires_at<=clock_timestamp() OR NOT ((p_mode='prepare' AND r.phase='requested') OR (p_mode='commit' AND r.phase='prepared')) THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 SELECT least(s.expires_at,h.valid_until,clock_timestamp()+interval '10 minutes') INTO expires
 FROM lzc_auth.sessions s JOIN lzc.stackit_identities h ON h.user_id=s.user_id
 WHERE s.id=p_session AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL;
 IF expires IS NULL OR expires<clock_timestamp()+interval '2 minutes' THEN
  RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO lzc.application_state_recovery_tasks(id,recovery_id,tenant_id,mode,issuer_session_id,issued_by,ticket_hash,input_ciphertext,expires_at)
 VALUES(p_task,p_id,r.tenant_id,p_mode,p_session,lzc.current_user_id(),p_hash,p_private,expires) RETURNING * INTO t;
 UPDATE lzc.application_state_recoveries SET phase=CASE p_mode WHEN 'prepare' THEN 'assessing' ELSE 'committing' END,
  expires_at=expires,private_ciphertext=p_private,public_view=p_view||jsonb_build_object('expiresAt',to_char(expires AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) WHERE id=p_id;
 RETURN t;
END $$;

CREATE FUNCTION lzc_auth.bind_application_state_recovery_task(p_session uuid,p_task uuid,p_app uuid,p_package uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issued_by=lzc.current_user_id() AND issuer_session_id=p_session FOR UPDATE;
 IF NOT FOUND OR t.expires_at<=clock_timestamp() OR t.finished_at IS NOT NULL OR t.runner_app_id IS NOT NULL THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 UPDATE lzc.application_state_recovery_tasks SET runner_app_id=p_app,runner_package_id=p_package WHERE id=p_task;
END $$;

CREATE FUNCTION lzc_auth.resolve_application_state_recovery_task(p_hash text,p_package uuid)
RETURNS TABLE(task_id uuid,recovery_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT t.id,t.recovery_id,s.id,s.user_id,t.tenant_id,least(t.expires_at,s.expires_at,h.valid_until)
 FROM lzc.application_state_recovery_tasks t JOIN lzc.application_state_recoveries r ON r.id=t.recovery_id
 JOIN lzc_auth.sessions s ON s.id=t.issuer_session_id AND s.user_id=t.issued_by
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=t.tenant_id
 JOIN lzc.tenants org ON org.id=t.tenant_id AND org.archived_at IS NULL AND org.organization_verified
 JOIN lzc.stackit_identities h ON h.user_id=s.user_id AND h.issuer='https://accounts.stackit.cloud' AND h.revoked_at IS NULL
 WHERE t.ticket_hash=p_hash AND t.runner_package_id=p_package AND t.finished_at IS NULL
 AND t.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND h.valid_until>clock_timestamp()
 AND coalesce(s.active_tenant_id,s.tenant_id)=t.tenant_id AND 'platform-engineer'=ANY(m.product_roles)
 AND ((t.mode='prepare' AND r.phase='assessing') OR (t.mode='commit' AND r.phase='committing'));
$$;

CREATE FUNCTION lzc_auth.release_application_state_recovery_input(p_session uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR t.input_released_at IS NOT NULL OR t.finished_at IS NOT NULL OR t.runner_app_id IS NULL OR t.expires_at<=clock_timestamp() THEN RETURN false; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 UPDATE lzc.application_state_recovery_tasks SET input_released_at=clock_timestamp() WHERE id=p_task;
 RETURN true;
END $$;

CREATE FUNCTION lzc_auth.fence_application_state_recovery(p_session uuid,p_task uuid,p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks; added integer;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR t.mode<>'commit' OR t.input_released_at IS NULL OR t.finished_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR p_step NOT IN ('unlock','publish') THEN RETURN false; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 IF p_step='publish' AND NOT EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step='unlock') THEN RETURN false; END IF;
 INSERT INTO lzc.application_state_recovery_intents(task_id,step) VALUES(p_task,p_step) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RETURN added=1;
END $$;

CREATE FUNCTION lzc_auth.finish_application_state_recovery_task(p_session uuid,p_task uuid,p_phase text,p_private bytea,p_view jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t lzc.application_state_recovery_tasks;
BEGIN
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 SELECT * INTO t FROM lzc.application_state_recovery_tasks WHERE id=p_task AND issuer_session_id=p_session AND issued_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR t.finished_at IS NOT NULL OR t.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 PERFORM lzc_auth.application_state_recovery_context(p_session,t.recovery_id);
 IF NOT ((t.mode='prepare' AND p_phase IN ('prepared','blocked')) OR
  (t.mode='commit' AND p_phase IN ('committed','reconciliation-required')) OR
  (t.mode='commit' AND p_phase='blocked' AND NOT EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task))) OR
  (p_phase='committed' AND NOT EXISTS(SELECT 1 FROM lzc.application_state_recovery_intents WHERE task_id=p_task AND step='publish')) THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 UPDATE lzc.application_state_recovery_tasks SET finished_at=clock_timestamp() WHERE id=p_task;
 INSERT INTO lzc.application_state_recovery_receipts(task_id,phase,review_session_id,reviewed_by,private_ciphertext,public_view)
 VALUES(p_task,p_phase,p_session,lzc.current_user_id(),p_private,p_view);
 UPDATE lzc.application_state_recoveries SET phase=p_phase,private_ciphertext=p_private,public_view=p_view WHERE id=t.recovery_id;
END $$;

REVOKE ALL ON FUNCTION lzc_auth.request_application_state_recovery(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.application_state_recovery_context(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.begin_application_state_recovery_task(uuid,uuid,uuid,text,text,bytea,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.bind_application_state_recovery_task(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.resolve_application_state_recovery_task(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.release_application_state_recovery_input(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.fence_application_state_recovery(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.finish_application_state_recovery_task(uuid,uuid,text,bytea,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.request_application_state_recovery(uuid,uuid,uuid,uuid,jsonb),
 lzc_auth.application_state_recovery_context(uuid,uuid),
 lzc_auth.begin_application_state_recovery_task(uuid,uuid,uuid,text,text,bytea,jsonb),
 lzc_auth.bind_application_state_recovery_task(uuid,uuid,uuid,uuid),
 lzc_auth.resolve_application_state_recovery_task(text,uuid),
 lzc_auth.release_application_state_recovery_input(uuid,uuid),
 lzc_auth.fence_application_state_recovery(uuid,uuid,text),
 lzc_auth.finish_application_state_recovery_task(uuid,uuid,text,bytea,jsonb) TO configurator_app;

-- A fresh human session can inspect a lost task response, never repeat its writes.
CREATE FUNCTION lzc_auth.inspect_application_state_recovery_task(p_session uuid,p_task uuid,p_phase text,p_private bytea,p_view jsonb,p_input_released boolean)
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
    (p_phase='blocked' AND t.input_released_at IS NULL) OR
    (p_phase='reconciliation-required' AND r.phase='committing')))) THEN
  RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
 IF t.finished_at IS NULL THEN
  UPDATE lzc.application_state_recovery_tasks SET finished_at=clock_timestamp() WHERE id=p_task;
 END IF;
 INSERT INTO lzc.application_state_recovery_receipts(task_id,phase,review_session_id,reviewed_by,private_ciphertext,public_view)
 VALUES(p_task,p_phase,p_session,lzc.current_user_id(),p_private,p_view);
 UPDATE lzc.application_state_recoveries SET phase=p_phase,private_ciphertext=p_private,public_view=p_view WHERE id=t.recovery_id;
END $$;
CREATE FUNCTION lzc_auth.block_application_state_recovery_assessment(p_session uuid,p_id uuid,p_view jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.application_state_recovery_context(p_session,p_id);
 UPDATE lzc.application_state_recoveries SET phase='blocked',public_view=p_view WHERE id=p_id AND phase='requested';
 IF NOT FOUND THEN RAISE EXCEPTION 'application_state_recovery_changed' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.inspect_application_state_recovery_task(uuid,uuid,text,bytea,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION lzc_auth.block_application_state_recovery_assessment(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.inspect_application_state_recovery_task(uuid,uuid,text,bytea,jsonb,boolean),
 lzc_auth.block_application_state_recovery_assessment(uuid,uuid,jsonb) TO configurator_app;

CREATE FUNCTION lzc.guard_application_state_recovery_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Same instance lock as normal Plan/Apply creation and recovery authorization.
 PERFORM 1 FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM lzc.application_state_recoveries WHERE instance_id=NEW.instance_id AND tenant_id=NEW.tenant_id
  AND phase IN ('requested','assessing','prepared','committing','reconciliation-required')) THEN
  RAISE EXCEPTION 'application_state_recovery_active' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_state_recovery_job() FROM PUBLIC;
CREATE TRIGGER application_state_recovery_exclusive BEFORE INSERT ON lzc.application_jobs
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_state_recovery_job();

CREATE FUNCTION lzc.guard_application_state_recovery_clearance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM lzc.application_state_recoveries WHERE job_id=NEW.job_id
  AND phase IN ('requested','assessing','prepared','committing','reconciliation-required')) THEN
  RAISE EXCEPTION 'application_state_recovery_active' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_application_state_recovery_clearance() FROM PUBLIC;
CREATE TRIGGER application_state_recovery_clearance BEFORE INSERT ON lzc.application_recovery_replans
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_state_recovery_clearance();
