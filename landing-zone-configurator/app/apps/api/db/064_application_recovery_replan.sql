-- Historical completion clearance; never an Apply authorization or State mutation.
CREATE TABLE lzc.application_recovery_replans (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_dispatches(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 reviewed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 review_session_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('reported-failure','operator-attested')),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 backend_id uuid NOT NULL REFERENCES lzc.state_backends(id),
 backend_sha256 text NOT NULL CHECK(backend_sha256 ~ '^[a-f0-9]{64}$'),
 state_key text NOT NULL,
 state_sha256 text NOT NULL CHECK(state_sha256 ~ '^[a-f0-9]{64}$'),
 state_serial bigint NOT NULL CHECK(state_serial>=0),
 state_version text CHECK(state_version IS NULL OR length(state_version) BETWEEN 1 AND 1024),
 attested_runner_stopped boolean NOT NULL,
 attested_cloud_state_compared boolean NOT NULL,
 CHECK(attested_runner_stopped=(mode='operator-attested') AND attested_cloud_state_compared=(mode='operator-attested'))
);
ALTER TABLE lzc.application_recovery_replans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_recovery_replans FORCE ROW LEVEL SECURITY;
CREATE POLICY application_recovery_replan_read ON lzc.application_recovery_replans FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND lzc.application_role('application-owner')) OR (reviewed_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_recovery_replan_migration ON lzc.application_recovery_replans TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_recovery_replans TO configurator_app;
CREATE TRIGGER immutable_application_recovery_replan BEFORE UPDATE OR DELETE ON lzc.application_recovery_replans
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.application_recovery_replan_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; dispatched lzc.application_dispatches;
 grant_row lzc.application_job_grants; bound lzc.application_job_backends; registered lzc.state_backends; descriptor_hash text; review_mode text;
BEGIN
 PERFORM 1 FROM lzc_auth.sessions WHERE id=p_session FOR SHARE;
 PERFORM 1 FROM lzc.memberships WHERE tenant_id=lzc.current_tenant_id() AND user_id=lzc.current_user_id() FOR SHARE;
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 PERFORM 1 FROM lzc.stackit_identities human WHERE human.user_id=lzc.current_user_id()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 IF job.id IS NULL OR NOT ((job.owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')))
  OR lzc.application_role('platform-engineer')) THEN
  RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501';
 END IF;
 -- The same instance lock serializes Plan, archive and review.
 PERFORM lzc_auth.require_active_application_order(p_session,job.instance_id);
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=p_job FOR SHARE;
 SELECT * INTO bound FROM lzc.application_job_backends WHERE job_id=p_job FOR SHARE;
 PERFORM 1 FROM lzc.application_runner_tickets WHERE job_id=p_job FOR SHARE;
 PERFORM lzc_auth.assert_application_job_group(p_job);
 IF job.owner_user_id=lzc.current_user_id() AND dispatched.error_code='apply_failed'
  AND EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='output') THEN
  review_mode:='reported-failure';
  IF NOT EXISTS(SELECT 1 FROM lzc.application_instances i JOIN lzc.stackit_identities human ON human.user_id=i.requested_by
    AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
    AND human.email=i.resolved_settings->>'owner_email' WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id) THEN
   RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501';
  END IF;
 ELSE
  review_mode:='operator-attested';
  context:=lzc_auth.application_recovery_review_context(p_session,p_job);
  IF NOT lzc.application_role('platform-engineer') OR NOT EXISTS(
   SELECT 1 FROM lzc.application_instances i
   JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id
   JOIN lzc.application_platform_contracts c ON c.revision=v.platform_revision AND c.tenant_id=v.tenant_id
   WHERE i.id=job.instance_id AND i.tenant_id=job.tenant_id AND c.approved_by=lzc.current_user_id()
  ) THEN RAISE EXCEPTION 'application_recovery_replan_access_denied' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO registered FROM lzc.state_backends b WHERE b.id=bound.backend_id AND b.tenant_id=job.tenant_id;
 IF job.operation IS DISTINCT FROM 'apply' OR dispatched.status IS DISTINCT FROM 'reconciliation_required'
  OR dispatched.finished_at IS NULL OR dispatched.runner_app_id IS NULL OR dispatched.error_code IS NOT DISTINCT FROM 'state_failed'
  OR grant_row.job_id IS NULL OR bound.job_id IS NULL OR registered.id IS NULL
  OR grant_row.binding_sha256 IS DISTINCT FROM job.binding_sha256
  OR bound.tenant_id IS DISTINCT FROM job.tenant_id OR bound.owner_user_id IS DISTINCT FROM job.owner_user_id
  OR bound.approved_by IS DISTINCT FROM grant_row.approved_by
  OR bound.descriptor->>'key' IS DISTINCT FROM grant_row.state_key
  OR grant_row.state_key IS DISTINCT FROM 'applications/'||job.tenant_id::text||'/'||job.instance_id::text||'/terraform.tfstate'
  OR bound.descriptor->>'useLockfile' IS DISTINCT FROM 'true'
  OR (review_mode='operator-attested' AND ((grant_row.revoked_at IS NULL AND grant_row.expires_at>now())
   OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job AND expires_at>now())))
  OR (review_mode='reported-failure' AND (NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket
    WHERE ticket.job_id=p_job AND ticket.tenant_id=job.tenant_id AND ticket.consumed_at IS NOT NULL AND ticket.runner_package_id=dispatched.runner_package_id)
   OR NOT EXISTS(SELECT 1 FROM lzc.application_runner_records output WHERE output.job_id=p_job AND output.kind='output'
    AND output.tenant_id=job.tenant_id AND output.owner_user_id=job.owner_user_id AND output.binding_sha256=job.binding_sha256
    AND output.state_key=grant_row.state_key AND output.runner_package_id=dispatched.runner_package_id)))
  OR EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery')
  OR EXISTS(SELECT 1 FROM lzc.application_dispatches other WHERE other.instance_id=job.instance_id AND other.tenant_id=job.tenant_id
   AND other.job_id<>p_job AND other.status NOT IN ('succeeded','failed','reconciliation_required'))
  OR (registered.descriptor - 'key' - 'useLockfile') IS DISTINCT FROM (bound.descriptor - 'key' - 'useLockfile')
  OR NOT EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=job.tenant_id AND t.organization_id=grant_row.organization_id AND t.organization_verified AND t.archived_at IS NULL)
 THEN RAISE EXCEPTION 'application_recovery_replan_unavailable' USING ERRCODE='40001'; END IF;
 descriptor_hash:=encode(sha256(convert_to(bound.descriptor::text,'UTF8')),'hex');
 -- Ciphertext is internal broker material; never serialize it into UI or proof tokens.
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'bindingSha256',job.binding_sha256,
  'status',dispatched.status,'operation',job.operation,'finishedAt',dispatched.finished_at,'recoverySha256',NULL,
  'finding','completion-review-required','mode',review_mode,
  'backendId',bound.backend_id,'backendDescriptor',bound.descriptor,'runnerAppId',dispatched.runner_app_id,
  'registeredBackendDescriptor',registered.descriptor,'backendCiphertext',encode(registered.credentials_ciphertext,'hex'),
  'stateKey',grant_row.state_key,'backendSha256',descriptor_hash,
  'existingReceipt',(SELECT to_jsonb(r) FROM lzc.application_recovery_replans r WHERE r.job_id=p_job));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_recovery_replan_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_recovery_replan_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.record_application_recovery_replan(p_session uuid,p_job uuid,p_binding text,p_backend_sha text,p_state_sha text,p_state_serial bigint,p_state_version text,p_attested boolean)
RETURNS lzc.application_recovery_replans LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; receipt lzc.application_recovery_replans;
BEGIN
 context:=lzc_auth.application_recovery_replan_context(p_session,p_job);
 IF p_attested IS DISTINCT FROM (context->>'mode'='operator-attested') OR p_state_sha IS NULL OR p_state_sha !~ '^[a-f0-9]{64}$'
  OR p_state_serial IS NULL OR p_state_serial<0 OR (p_state_version IS NOT NULL AND length(p_state_version) NOT BETWEEN 1 AND 1024)
 THEN RAISE EXCEPTION 'application_recovery_replan_unavailable' USING ERRCODE='40001'; END IF;
 IF context->>'bindingSha256' IS DISTINCT FROM p_binding OR context->>'backendSha256' IS DISTINCT FROM p_backend_sha THEN
  RAISE EXCEPTION 'application_recovery_replan_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job;
 SELECT * INTO receipt FROM lzc.application_recovery_replans WHERE job_id=p_job;
 IF FOUND THEN
  IF receipt.reviewed_by<>lzc.current_user_id() OR receipt.mode IS DISTINCT FROM context->>'mode' OR receipt.binding_sha256 IS DISTINCT FROM p_binding
   OR receipt.backend_sha256 IS DISTINCT FROM p_backend_sha OR receipt.state_sha256 IS DISTINCT FROM p_state_sha
   OR receipt.state_serial IS DISTINCT FROM p_state_serial OR receipt.state_version IS DISTINCT FROM p_state_version THEN
   RAISE EXCEPTION 'application_recovery_replan_changed' USING ERRCODE='40001';
  END IF;
  RETURN receipt;
 END IF;
 INSERT INTO lzc.application_recovery_replans(job_id,tenant_id,owner_user_id,reviewed_by,review_session_id,mode,binding_sha256,backend_id,backend_sha256,state_key,state_sha256,state_serial,state_version,attested_runner_stopped,attested_cloud_state_compared)
 VALUES(p_job,job.tenant_id,job.owner_user_id,lzc.current_user_id(),p_session,context->>'mode',p_binding,(context->>'backendId')::uuid,p_backend_sha,context->>'stateKey',p_state_sha,p_state_serial,p_state_version,p_attested,p_attested)
 RETURNING * INTO receipt;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.record_application_recovery_replan(uuid,uuid,text,text,text,bigint,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_application_recovery_replan(uuid,uuid,text,text,text,bigint,text,boolean) TO configurator_app;

-- Revalidate every historical clearance at every execution gate. New recovery
-- evidence, renewed capabilities or changed bindings close the gate again.
CREATE FUNCTION lzc_auth.application_recovery_replan_valid(p_job uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_recovery_replans r
  JOIN lzc.application_jobs j ON j.id=r.job_id AND j.tenant_id=r.tenant_id AND j.owner_user_id=r.owner_user_id AND j.operation='apply' AND j.binding_sha256=r.binding_sha256
  JOIN lzc.application_dispatches d ON d.job_id=j.id AND d.status='reconciliation_required' AND d.finished_at IS NOT NULL AND d.error_code IS DISTINCT FROM 'state_failed'
  JOIN lzc.application_job_grants g ON g.job_id=j.id AND g.binding_sha256=r.binding_sha256 AND g.state_key=r.state_key
  JOIN lzc.application_job_backends b ON b.job_id=j.id AND b.backend_id=r.backend_id AND b.tenant_id=r.tenant_id
   AND encode(sha256(convert_to(b.descriptor::text,'UTF8')),'hex')=r.backend_sha256
  WHERE r.job_id=p_job AND (
    (r.mode='operator-attested' AND (g.revoked_at IS NOT NULL OR g.expires_at<=now())
     AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job AND expires_at>now()))
    OR (r.mode='reported-failure' AND d.error_code='apply_failed'
     AND EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=p_job AND ticket.tenant_id=j.tenant_id
      AND ticket.consumed_at IS NOT NULL AND ticket.runner_package_id=d.runner_package_id)
     AND EXISTS(SELECT 1 FROM lzc.application_runner_records output WHERE output.job_id=p_job AND output.kind='output'
      AND output.tenant_id=j.tenant_id AND output.owner_user_id=j.owner_user_id AND output.binding_sha256=j.binding_sha256
      AND output.state_key=g.state_key AND output.runner_package_id=d.runner_package_id)))
   AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_records WHERE job_id=p_job AND kind='recovery'));
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_recovery_replan_valid(uuid) FROM PUBLIC;

-- Public listing exposes only a caller-visible historical clearance boolean.
CREATE FUNCTION lzc_auth.application_recovery_replan_approved(p_job uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_jobs j
  JOIN lzc.application_job_grants g ON g.job_id=j.id AND g.tenant_id=j.tenant_id
  WHERE j.id=p_job AND j.tenant_id=lzc.current_tenant_id()
   AND ((j.owner_user_id=lzc.current_user_id() AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer')))
    OR (g.approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer')))
   AND lzc_auth.application_recovery_replan_valid(j.id));
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_recovery_replan_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_recovery_replan_approved(uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.application_execution_blocked(p_job uuid,p_instance uuid,p_tenant uuid,p_purpose text,p_apply_only boolean DEFAULT false) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM lzc.application_dispatches d WHERE d.tenant_id=p_tenant AND d.instance_id=p_instance AND d.job_id<>p_job
   AND (NOT p_apply_only OR EXISTS(SELECT 1 FROM lzc.application_jobs job WHERE job.id=d.job_id AND job.operation='apply'))
   AND (d.status NOT IN ('succeeded','failed','reconciliation_required') OR (d.status='reconciliation_required' AND NOT (
    (p_purpose='standard' AND lzc_auth.application_recovery_replan_valid(d.job_id)) OR
    (p_purpose IN ('destroy','drift') AND d.finished_at IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=d.job_id AND t.expires_at>now())
     AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_records r WHERE r.job_id=d.job_id AND r.kind='recovery'))
   )))
 );
$$;

CREATE FUNCTION lzc_auth.assert_application_replan_fresh(p_plan uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM lzc.application_jobs planned
  JOIN lzc.application_recovery_replans r ON r.tenant_id=planned.tenant_id
  JOIN lzc.application_dispatches d ON d.job_id=r.job_id AND d.instance_id=planned.instance_id
  WHERE planned.id=p_plan AND planned.created_at<=greatest(r.reviewed_at,d.finished_at)) THEN
  RAISE EXCEPTION 'application_recovery_fresh_plan_required' USING ERRCODE='40001';
 END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_replan_fresh(uuid) FROM PUBLIC;

DO $$
DECLARE definition text; signature text; anchor text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_apply_plan(uuid,uuid,text)','lzc_auth.application_running_apply_plan(uuid,uuid,text,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:=' RETURN jsonb_build_object(''planId'',p_plan';
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application recovery saved plan source mismatch'; END IF;
  EXECUTE replace(definition,anchor,' PERFORM lzc_auth.assert_application_replan_fresh(p_plan);'||chr(10)||anchor);
 END LOOP;
 definition:=pg_get_functiondef('lzc.validate_application_apply()'::regprocedure);
 anchor:=' context:=lzc_auth.application_apply_plan(NEW.issuer_session_id,NEW.plan_id,NEW.artifact_sha256);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application recovery apply source mismatch'; END IF;
 EXECUTE replace(definition,anchor,' PERFORM lzc_auth.assert_application_replan_fresh(NEW.plan_id);'||chr(10)||anchor);
END $$;
