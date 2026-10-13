CREATE TABLE lzc.application_recovery_reviews (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_dispatches(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 reviewed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 review_session_id uuid NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 recovery_sha256 text CHECK(recovery_sha256 ~ '^[a-f0-9]{64}$'),
 finding text NOT NULL CHECK(finding IN ('state-review-required','completion-review-required')),
 CHECK((finding='state-review-required')=(recovery_sha256 IS NOT NULL))
);
ALTER TABLE lzc.application_recovery_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_recovery_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY application_recovery_review_read ON lzc.application_recovery_reviews FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND lzc.application_role('application-owner')) OR (reviewed_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_recovery_review_migration ON lzc.application_recovery_reviews TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_recovery_reviews TO configurator_app;
CREATE TRIGGER immutable_application_recovery_review BEFORE UPDATE OR DELETE ON lzc.application_recovery_reviews
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.application_recovery_review_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; grant_row lzc.application_job_grants; dispatched lzc.application_dispatches; recovery lzc.application_runner_records;
BEGIN
 PERFORM 1 FROM lzc_auth.sessions WHERE id=p_session FOR SHARE;
 PERFORM 1 FROM lzc.memberships WHERE tenant_id=lzc.current_tenant_id() AND user_id=lzc.current_user_id() FOR SHARE;
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 PERFORM 1 FROM lzc.stackit_identities human WHERE human.user_id=lzc.current_user_id()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'application_recovery_review_access_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 SELECT * INTO grant_row FROM lzc.application_job_grants WHERE job_id=job.id AND tenant_id=job.tenant_id;
 IF job.id IS NULL OR grant_row.approved_by IS DISTINCT FROM lzc.current_user_id() THEN
  RAISE EXCEPTION 'application_recovery_review_access_denied' USING ERRCODE='42501';
 END IF;
 PERFORM lzc_auth.require_active_application_order(p_session,job.instance_id);
 SELECT * INTO dispatched FROM lzc.application_dispatches WHERE job_id=job.id AND tenant_id=job.tenant_id;
 SELECT * INTO recovery FROM lzc.application_runner_records WHERE job_id=job.id AND tenant_id=job.tenant_id AND kind='recovery';
 RETURN jsonb_build_object('jobId',job.id,'instanceId',job.instance_id,'bindingSha256',job.binding_sha256,
  'status',coalesce(dispatched.status,job.status),'operation',job.operation,
  'finishedAt',dispatched.finished_at,'recoverySha256',recovery.sha256,
  'finding',CASE WHEN recovery.job_id IS NULL THEN 'completion-review-required' ELSE 'state-review-required' END);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_recovery_review_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_recovery_review_context(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.record_application_recovery_review(p_session uuid,p_job uuid,p_binding text,p_recovery text)
RETURNS lzc.application_recovery_reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; receipt lzc.application_recovery_reviews;
BEGIN
 context:=lzc_auth.application_recovery_review_context(p_session,p_job);
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 PERFORM 1 FROM lzc.application_instances WHERE id=job.instance_id AND tenant_id=job.tenant_id FOR UPDATE;
 PERFORM 1 FROM lzc.application_dispatches WHERE job_id=p_job FOR UPDATE;
 context:=lzc_auth.application_recovery_review_context(p_session,p_job);
 IF context->>'bindingSha256' IS DISTINCT FROM p_binding OR context->>'recoverySha256' IS DISTINCT FROM p_recovery THEN
  RAISE EXCEPTION 'application_recovery_review_changed' USING ERRCODE='40001';
 END IF;
 IF context->>'status' NOT IN ('failed','reconciliation_required') OR context->>'finishedAt' IS NULL THEN
  RAISE EXCEPTION 'application_recovery_review_unavailable' USING ERRCODE='40001';
 END IF;
 SELECT * INTO receipt FROM lzc.application_recovery_reviews WHERE job_id=p_job;
 IF FOUND THEN
  IF receipt.reviewed_by<>lzc.current_user_id() OR receipt.binding_sha256 IS DISTINCT FROM p_binding OR receipt.recovery_sha256 IS DISTINCT FROM p_recovery THEN
   RAISE EXCEPTION 'application_recovery_review_changed' USING ERRCODE='40001';
  END IF;
  RETURN receipt;
 END IF;
 INSERT INTO lzc.application_recovery_reviews(job_id,tenant_id,owner_user_id,reviewed_by,review_session_id,binding_sha256,recovery_sha256,finding)
 VALUES(job.id,job.tenant_id,job.owner_user_id,lzc.current_user_id(),p_session,p_binding,p_recovery,context->>'finding') RETURNING * INTO receipt;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.record_application_recovery_review(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_application_recovery_review(uuid,uuid,text,text) TO configurator_app;