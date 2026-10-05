ALTER TABLE lzc.stackit_organization_access ADD COLUMN permissions text[]
  CHECK (cardinality(permissions) <= 512 AND array_position(permissions, NULL) IS NULL);
GRANT UPDATE(permissions) ON lzc.stackit_organization_access TO configurator_app;
ALTER TABLE lzc.stackit_organization_access ADD COLUMN owner_permissions text[]
  CHECK (cardinality(owner_permissions) BETWEEN 1 AND 512 AND array_position(owner_permissions, NULL) IS NULL);
GRANT UPDATE(owner_permissions) ON lzc.stackit_organization_access TO configurator_app;

CREATE TABLE lzc.stackit_organization_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
  user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
  organization_id uuid NOT NULL,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text NOT NULL,
  permissions text[] NOT NULL,
  owner_permissions text[],
  verified_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  CHECK (valid_until > verified_at)
);

ALTER TABLE lzc.stackit_organization_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.stackit_organization_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_authorization_owner ON lzc.stackit_organization_authorizations TO configurator_app
  USING (tenant_id = lzc.current_tenant_id() AND user_id = lzc.current_user_id());
CREATE POLICY migrate_organization_authorization ON lzc.stackit_organization_authorizations TO configurator_migration
  USING (true) WITH CHECK (true);
GRANT SELECT ON lzc.stackit_organization_authorizations TO configurator_app;

CREATE FUNCTION lzc.record_organization_authorization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.permissions IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM lzc.current_user_id() OR NEW.tenant_id IS DISTINCT FROM lzc.current_tenant_id() THEN
      RAISE EXCEPTION 'stale_tenant_context' USING ERRCODE='42501';
    END IF;
    INSERT INTO lzc.stackit_organization_authorizations(tenant_id,user_id,organization_id,issuer,subject,email,permissions,owner_permissions,verified_at,valid_until)
    SELECT NEW.tenant_id,NEW.user_id,NEW.organization_id,i.issuer,i.subject,i.email,NEW.permissions,NEW.owner_permissions,NEW.verified_at,NEW.valid_until
    FROM lzc.stackit_identities i WHERE i.user_id=NEW.user_id AND i.revoked_at IS NULL AND i.valid_until>=NEW.valid_until AND i.valid_until>now() AND i.verified_at<=NEW.verified_at;
    IF NOT FOUND THEN RAISE EXCEPTION 'identity_proof_expired' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.record_organization_authorization() FROM PUBLIC;
CREATE TRIGGER record_organization_authorization AFTER INSERT OR UPDATE ON lzc.stackit_organization_access
  FOR EACH ROW EXECUTE FUNCTION lzc.record_organization_authorization();

CREATE FUNCTION lzc.immutable_organization_authorization() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'organization_authorization_immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER immutable_organization_authorization BEFORE UPDATE OR DELETE ON lzc.stackit_organization_authorizations
  FOR EACH ROW EXECUTE FUNCTION lzc.immutable_organization_authorization();