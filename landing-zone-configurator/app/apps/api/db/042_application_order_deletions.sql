CREATE TABLE lzc.application_order_deletions (
 instance_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 deleted_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 deleted_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES lzc.application_instances(tenant_id,id)
);
ALTER TABLE lzc.application_order_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_order_deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY application_deletion_read ON lzc.application_order_deletions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND EXISTS(
  SELECT 1 FROM lzc.application_instances i WHERE i.id=instance_id AND i.tenant_id=lzc.current_tenant_id()
  AND (i.requested_by=lzc.current_user_id() OR lzc.application_role('platform-engineer'))
 ));
CREATE POLICY application_deletion_migration ON lzc.application_order_deletions TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_order_deletions TO configurator_app;
CREATE TRIGGER immutable_application_deletion BEFORE UPDATE OR DELETE ON lzc.application_order_deletions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc.application_order_deletable(p_instance uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=p_instance AND i.tenant_id=lzc.current_tenant_id()
  AND (i.requested_by=lzc.current_user_id() OR lzc.application_role('platform-engineer'))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=i.id)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches dispatched WHERE dispatched.instance_id=i.id)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_job_claims claimed ON claimed.job_id=job.id WHERE job.instance_id=i.id)
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_runner_tickets ticket ON ticket.job_id=job.id WHERE job.instance_id=i.id)
 );
$$;
REVOKE ALL ON FUNCTION lzc.application_order_deletable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_order_deletable(uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.delete_application_order(p_session uuid,p_instance uuid)
RETURNS lzc.application_order_deletions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; deleted lzc.application_order_deletions;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND OR (ordered.requested_by<>lzc.current_user_id() AND NOT lzc.application_role('platform-engineer')) THEN
  RAISE EXCEPTION 'application_deletion_access_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO deleted FROM lzc.application_order_deletions WHERE instance_id=p_instance;
 IF FOUND THEN RETURN deleted; END IF;
 IF NOT lzc.application_order_deletable(p_instance) THEN
  RAISE EXCEPTION 'application_order_execution_started' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by)
 VALUES(ordered.id,ordered.tenant_id,lzc.current_user_id()) RETURNING * INTO deleted;
 RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delete_application_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delete_application_order(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.require_active_application_order(p_session uuid,p_instance uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND OR (ordered.requested_by<>lzc.current_user_id() AND NOT lzc.application_role('platform-engineer')) THEN
  RAISE EXCEPTION 'application_deletion_access_denied' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=ordered.id) THEN
  RAISE EXCEPTION 'application_order_deleted' USING ERRCODE='40001';
 END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.require_active_application_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.require_active_application_order(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc.require_active_application_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered_id uuid; ordered lzc.application_instances;
BEGIN
 IF TG_TABLE_NAME IN ('application_job_claims','application_runner_tickets','application_job_backends') THEN
  SELECT job.instance_id INTO ordered_id FROM lzc.application_jobs job WHERE job.id=NEW.job_id AND job.tenant_id=NEW.tenant_id;
 ELSE ordered_id=NEW.instance_id;
 END IF;
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=ordered_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=ordered.id) THEN
  RAISE EXCEPTION 'application_order_deleted' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.require_active_application_order() FROM PUBLIC;
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_job_grants FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_job_claims FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_job_backends FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();
CREATE TRIGGER application_order_active BEFORE INSERT ON lzc.application_order_decisions FOR EACH ROW EXECUTE FUNCTION lzc.require_active_application_order();