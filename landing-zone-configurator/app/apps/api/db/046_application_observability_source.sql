ALTER TABLE lzc.application_job_grants DROP CONSTRAINT application_job_grants_accelerator_revision_check;
ALTER TABLE lzc.application_job_grants ADD CONSTRAINT application_job_grants_accelerator_revision_check
 CHECK(accelerator_revision IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f'));
ALTER TABLE lzc.application_runner_tickets DROP CONSTRAINT application_runner_tickets_accelerator_revision_check;
ALTER TABLE lzc.application_runner_tickets ADD CONSTRAINT application_runner_tickets_accelerator_revision_check
 CHECK(accelerator_revision IN ('c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f'));

DO $$
DECLARE definition text;
 old_guard text := 'grant_row.accelerator_revision<>''c4b43c36af198985980b17626c48d357795e3fbd''';
 new_guard text := 'grant_row.accelerator_revision NOT IN (''c4b43c36af198985980b17626c48d357795e3fbd'',''88149782bf8e91dcdbb43a203b54337886023f7f'')';
BEGIN
 definition := pg_get_functiondef('lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'::regprocedure);
 IF strpos(definition,old_guard)=0 THEN RAISE EXCEPTION 'application_source_guard_missing'; END IF;
 EXECUTE replace(definition,old_guard,new_guard);
END $$;

CREATE OR REPLACE FUNCTION lzc.issue_application_job_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; i lzc.application_instances; v lzc.application_template_versions;
 c lzc.application_platform_contracts; human lzc.stackit_identities;
BEGIN
 PERFORM lzc_auth.authorize_application(NEW.issuer_session_id,NEW.tenant_id,'order');
 SELECT * INTO s FROM lzc_auth.sessions WHERE id=NEW.issuer_session_id;
 SELECT * INTO i FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id AND requested_by=NEW.owner_user_id;
 IF NOT FOUND OR s.user_id IS DISTINCT FROM NEW.owner_user_id THEN
  RAISE EXCEPTION 'application_job_owner_mismatch' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v FROM lzc.application_template_versions WHERE id=i.version_id AND tenant_id=i.tenant_id;
 SELECT * INTO c FROM lzc.application_platform_contracts WHERE revision=v.platform_revision AND tenant_id=i.tenant_id;
 IF NOT FOUND OR v.accelerator_revision NOT IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f') OR
  i.deployment_policy IS DISTINCT FROM v.deployment_policy OR NOT EXISTS(
   SELECT 1 FROM lzc.tenants t WHERE t.id=i.tenant_id AND t.organization_id=c.organization_id AND t.organization_verified AND t.archived_at IS NULL
  ) OR NOT EXISTS(
   SELECT 1 FROM lzc.memberships m WHERE m.tenant_id=i.tenant_id AND m.user_id=c.approved_by AND 'platform-engineer'=ANY(m.product_roles)
  ) THEN RAISE EXCEPTION 'application_job_contract_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO human FROM lzc.stackit_identities WHERE user_id=i.requested_by AND issuer='https://accounts.stackit.cloud' AND revoked_at IS NULL AND valid_until>now();
 IF NOT FOUND OR i.resolved_settings->>'owner_email' IS DISTINCT FROM human.email OR
  NEW.expires_at>least(s.expires_at,human.valid_until,now()+interval '25 minutes') THEN
  RAISE EXCEPTION 'application_job_identity_unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO lzc.application_job_grants(job_id,tenant_id,owner_user_id,instance_id,version_id,platform_revision,approved_by,organization_id,credential_profile_id,credential_version,credential_key_id,accelerator_revision,state_key,operation,binding_sha256,expires_at)
 VALUES(NEW.id,i.tenant_id,i.requested_by,i.id,i.version_id,c.revision,c.approved_by,c.organization_id,c.credential_profile_id,c.credential_version,c.credential_key_id,v.accelerator_revision,'applications/' || i.tenant_id::text || '/' || i.id::text || '/terraform.tfstate',NEW.operation,NEW.binding_sha256,NEW.expires_at);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION lzc_auth.reserve_application_dispatch(p_session uuid,p_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; approved lzc.application_job_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.accelerator_revision NOT IN ('c4b43c36af198985980b17626c48d357795e3fbd','88149782bf8e91dcdbb43a203b54337886023f7f') OR NOT EXISTS(
  SELECT 1 FROM lzc.tenants t WHERE t.id=g.tenant_id AND t.organization_id=g.organization_id AND t.organization_verified AND t.archived_at IS NULL
 ) THEN RAISE EXCEPTION 'application_dispatch_grant_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_session_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,approved.backend_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('application-dispatch:' || g.tenant_id::text || ':' || g.instance_id::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE job_id=p_job) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_dispatch_grant_consumed' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=g.tenant_id AND instance_id=g.instance_id AND status NOT IN ('succeeded','failed')) THEN
  RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id)
 VALUES(g.job_id,g.tenant_id,g.instance_id,g.owner_user_id,g.approved_by,p_session);
 RETURN true;
END $$;