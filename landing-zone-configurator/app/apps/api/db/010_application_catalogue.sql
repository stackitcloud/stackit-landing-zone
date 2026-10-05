CREATE FUNCTION lzc.application_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS (
  SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=lzc.current_tenant_id() AND m.user_id=lzc.current_user_id()
   AND t.archived_at IS NULL AND (
    p_role=ANY(m.product_roles) OR
    (t.kind='personal' AND t.owner_user_id=m.user_id AND m.role='admin')
   )
 )
$$;
REVOKE ALL ON FUNCTION lzc.application_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_role(text) TO configurator_app;

CREATE FUNCTION lzc_auth.authorize_application(p_session uuid,p_tenant uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions; t lzc.tenants; m lzc.memberships;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 IF coalesce(s.active_tenant_id,s.tenant_id)<>p_tenant OR
  lzc.current_tenant_id() IS DISTINCT FROM p_tenant OR
  lzc.current_user_id() IS DISTINCT FROM s.user_id THEN
  RAISE EXCEPTION 'stale_application_context' USING ERRCODE='42501';
 END IF;
 SELECT * INTO t FROM lzc.tenants WHERE id=p_tenant AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=s.user_id;
 IF NOT FOUND OR p_action NOT IN ('read','publish','order') OR NOT (
  (t.kind='personal' AND t.owner_user_id=s.user_id AND m.role='admin') OR
  'platform-engineer'=ANY(m.product_roles) OR
  (p_action<>'publish' AND 'application-owner'=ANY(m.product_roles))
 ) THEN RAISE EXCEPTION 'application_access_denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.authorize_application(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.authorize_application(uuid,uuid,text) TO configurator_app;

CREATE TABLE lzc.application_template_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 template_id uuid NOT NULL,
 version integer NOT NULL CHECK (version>0),
 published_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 accelerator_revision text NOT NULL CHECK (accelerator_revision ~ '^[0-9a-f]{40}$'),
 document jsonb NOT NULL CHECK (jsonb_typeof(document)='object'),
 UNIQUE(tenant_id,template_id,version),
 UNIQUE(tenant_id,id)
);

CREATE TABLE lzc.application_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 version_id uuid NOT NULL,
 requested_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 idempotency_key uuid NOT NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
 parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters)='object'),
 resolved_settings jsonb NOT NULL CHECK (jsonb_typeof(resolved_settings)='object'),
 qualification_blockers jsonb NOT NULL CHECK (jsonb_typeof(qualification_blockers)='array' AND jsonb_array_length(qualification_blockers)>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,version_id) REFERENCES lzc.application_template_versions(tenant_id,id),
 UNIQUE(tenant_id,requested_by,idempotency_key)
);

ALTER TABLE lzc.application_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_template_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_instances FORCE ROW LEVEL SECURITY;

CREATE POLICY application_version_read ON lzc.application_template_versions FOR SELECT TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_version_insert ON lzc.application_template_versions FOR INSERT TO configurator_app
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND published_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY application_instance_read ON lzc.application_instances FOR SELECT TO configurator_app
 USING (tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR (requested_by=lzc.current_user_id() AND lzc.application_role('application-owner'))));
CREATE POLICY application_instance_insert ON lzc.application_instances FOR INSERT TO configurator_app
 WITH CHECK (tenant_id=lzc.current_tenant_id() AND requested_by=lzc.current_user_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_version_migration ON lzc.application_template_versions TO configurator_migration USING (true) WITH CHECK (true);
CREATE POLICY application_instance_migration ON lzc.application_instances TO configurator_migration USING (true) WITH CHECK (true);
GRANT SELECT,INSERT ON lzc.application_template_versions,lzc.application_instances TO configurator_app;

CREATE FUNCTION lzc.immutable_application_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'immutable_application_version' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION lzc.immutable_application_version() FROM PUBLIC;
CREATE TRIGGER immutable_application_version BEFORE UPDATE OR DELETE ON lzc.application_template_versions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc.protect_application_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (
  EXISTS(SELECT 1 FROM lzc.application_template_versions WHERE tenant_id=NEW.id) OR
  EXISTS(SELECT 1 FROM lzc.application_instances WHERE tenant_id=NEW.id)
 ) THEN RAISE EXCEPTION 'organisation_not_empty_draft' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.protect_application_archive() FROM PUBLIC;
CREATE TRIGGER protect_application_archive BEFORE UPDATE OF archived_at ON lzc.tenants
 FOR EACH ROW EXECUTE FUNCTION lzc.protect_application_archive();