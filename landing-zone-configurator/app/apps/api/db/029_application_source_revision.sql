ALTER TABLE lzc.application_job_grants DROP CONSTRAINT application_job_grants_accelerator_revision_check;
ALTER TABLE lzc.application_job_grants ADD CONSTRAINT application_job_grants_accelerator_revision_check
 CHECK(accelerator_revision IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd'));

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
 IF NOT FOUND OR v.accelerator_revision NOT IN ('4d15d7870afa323badd93559d8b37c5a8d138dcf','c4b43c36af198985980b17626c48d357795e3fbd') OR
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