CREATE TABLE lzc.plan_credential_grants (
 run_id uuid PRIMARY KEY REFERENCES lzc.plan_runs(id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 preparation_id uuid NOT NULL REFERENCES lzc.deployment_preparations(id),
 organization_id uuid NOT NULL,
 credential_profile_id uuid NOT NULL,
 credential_version integer NOT NULL CHECK(credential_version>0),
 credential_key_id text NOT NULL,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN ('plan','apply')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 revoked_at timestamptz,
 consumed_at timestamptz
);

ALTER TABLE lzc.plan_credential_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.plan_credential_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_credential_grants_app ON lzc.plan_credential_grants TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role())
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND lzc.deployment_role());
CREATE POLICY plan_credential_grants_migration ON lzc.plan_credential_grants TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.plan_credential_grants TO configurator_app;
GRANT UPDATE(revoked_at,consumed_at) ON lzc.plan_credential_grants TO configurator_app;

CREATE FUNCTION lzc.guard_plan_credential_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'immutable_credential_grant' USING ERRCODE='55000';
 END IF;
 IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM lzc.plan_runs run
     JOIN lzc.deployment_preparations preparation ON preparation.id=run.preparation_id
     WHERE run.id=NEW.run_id
   AND run.tenant_id=NEW.tenant_id AND run.owner_user_id=NEW.owner_user_id
   AND run.preparation_id=NEW.preparation_id AND run.operation=NEW.operation
     AND preparation.tenant_id=NEW.tenant_id AND preparation.owner_user_id=NEW.owner_user_id
     AND (preparation.manifest#>>'{organization,id}')::uuid=NEW.organization_id
     AND (preparation.manifest#>>'{credential,id}')::uuid=NEW.credential_profile_id
     AND (preparation.manifest#>>'{credential,secretVersion}')::integer=NEW.credential_version
     AND preparation.manifest#>>'{credential,keyId}'=NEW.credential_key_id
   AND run.status='starting' AND NOT run.input_claimed
    AND NEW.expires_at<=run.expires_at
     AND NEW.revoked_at IS NULL AND NEW.consumed_at IS NULL) THEN
   RAISE EXCEPTION 'invalid_credential_grant' USING ERRCODE='42501';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-'revoked_at'-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at'-'consumed_at')
   OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
   OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at) THEN
   RAISE EXCEPTION 'immutable_credential_grant' USING ERRCODE='55000';
  END IF;
  IF NEW.consumed_at IS DISTINCT FROM OLD.consumed_at AND (
   NEW.revoked_at IS NOT NULL OR NEW.expires_at<=now() OR NOT EXISTS(
    SELECT 1 FROM lzc.plan_runs run WHERE run.id=NEW.run_id AND run.status='initializing'
    AND run.input_claimed AND run.expires_at>now())) THEN
   RAISE EXCEPTION 'credential_grant_unavailable' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lzc.guard_plan_credential_grant() FROM PUBLIC;
CREATE TRIGGER guard_plan_credential_grant BEFORE INSERT OR UPDATE OR DELETE ON lzc.plan_credential_grants
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_plan_credential_grant();