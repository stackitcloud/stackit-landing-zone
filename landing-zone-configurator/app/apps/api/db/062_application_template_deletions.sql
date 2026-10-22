-- Catalogue deletion retains immutable publication evidence and version numbers.
-- A historical order, including a deleted/archived one, permanently prevents it.
CREATE TABLE lzc.application_template_deletions (
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 version_id uuid NOT NULL,
 deleted_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,version_id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES lzc.application_template_retirements(tenant_id,version_id)
);
ALTER TABLE lzc.application_template_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_template_deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY application_template_deletion_read ON lzc.application_template_deletions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')));
CREATE POLICY application_template_deletion_migration ON lzc.application_template_deletions TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_template_deletions TO configurator_app;
CREATE TRIGGER immutable_application_template_deletion BEFORE UPDATE OR DELETE ON lzc.application_template_deletions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc.application_template_deletable(p_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc.application_role('platform-engineer') AND EXISTS(
  SELECT 1 FROM lzc.application_template_retirements r
  WHERE r.tenant_id=lzc.current_tenant_id() AND r.version_id=p_version
   AND NOT EXISTS(SELECT 1 FROM lzc.application_template_deletions d WHERE d.tenant_id=r.tenant_id AND d.version_id=r.version_id)
   AND NOT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.tenant_id=r.tenant_id AND i.version_id=r.version_id)
 );
$$;
REVOKE ALL ON FUNCTION lzc.application_template_deletable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_template_deletable(uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.delete_application_template(p_session uuid,p_version uuid)
RETURNS lzc.application_template_deletions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE deleted lzc.application_template_deletions;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 -- Same lock as ordering and retirement; no check/delete race with a new order.
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:' || lzc.current_tenant_id()::text || ':' || p_version::text,0));
 PERFORM 1 FROM lzc.application_template_versions WHERE tenant_id=lzc.current_tenant_id() AND id=p_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO deleted FROM lzc.application_template_deletions WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version;
 IF FOUND THEN RETURN deleted; END IF;
 IF NOT EXISTS(SELECT 1 FROM lzc.application_template_retirements WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version) THEN
  RAISE EXCEPTION 'template_version_not_retired' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_instances WHERE tenant_id=lzc.current_tenant_id() AND version_id=p_version) THEN
  RAISE EXCEPTION 'template_version_in_use' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_template_deletions(tenant_id,version_id,deleted_by)
 VALUES(lzc.current_tenant_id(),p_version,lzc.current_user_id()) RETURNING * INTO deleted;
 RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delete_application_template(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delete_application_template(uuid,uuid) TO configurator_app;
