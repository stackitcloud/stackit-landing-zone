CREATE TABLE lzc.application_template_retirements (
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 version_id uuid NOT NULL,
 retired_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 retired_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,version_id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES lzc.application_template_versions(tenant_id,id)
);

ALTER TABLE lzc.application_template_retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_template_retirements FORCE ROW LEVEL SECURITY;
CREATE POLICY application_retirement_read ON lzc.application_template_retirements FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_retirement_insert ON lzc.application_template_retirements FOR INSERT TO configurator_app
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND retired_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'));
CREATE POLICY application_retirement_migration ON lzc.application_template_retirements TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.application_template_retirements TO configurator_app;
CREATE TRIGGER immutable_application_retirement BEFORE UPDATE OR DELETE ON lzc.application_template_retirements
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc.lock_application_availability() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:' || NEW.tenant_id::text || ':' || NEW.version_id::text,0));
 IF TG_TABLE_NAME='application_instances' AND EXISTS(
  SELECT 1 FROM lzc.application_template_retirements r WHERE r.tenant_id=NEW.tenant_id AND r.version_id=NEW.version_id
 ) THEN RAISE EXCEPTION 'template_version_retired' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.lock_application_availability() FROM PUBLIC;
CREATE TRIGGER lock_application_retirement BEFORE INSERT ON lzc.application_template_retirements
 FOR EACH ROW EXECUTE FUNCTION lzc.lock_application_availability();
CREATE TRIGGER lock_application_order BEFORE INSERT ON lzc.application_instances
 FOR EACH ROW EXECUTE FUNCTION lzc.lock_application_availability();