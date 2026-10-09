ALTER TABLE lzc.application_instances ADD UNIQUE(tenant_id,id);

CREATE TABLE lzc.application_order_decisions (
 instance_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 decided_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 decided_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL CHECK(length(reason)<=1000 AND (decision<>'rejected' OR length(btrim(reason))>0)),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES lzc.application_instances(tenant_id,id)
);
ALTER TABLE lzc.application_order_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_order_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY application_decision_read ON lzc.application_order_decisions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND EXISTS(
  SELECT 1 FROM lzc.application_instances i WHERE i.id=instance_id AND i.tenant_id=tenant_id
  AND (lzc.application_role('platform-engineer') OR i.requested_by=lzc.current_user_id())
 ));
CREATE POLICY application_decision_migration ON lzc.application_order_decisions TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_order_decisions TO configurator_app;
CREATE TRIGGER immutable_application_decision BEFORE UPDATE OR DELETE ON lzc.application_order_decisions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.decide_application_order(p_session uuid,p_instance uuid,p_decision text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; existing lzc.application_order_decisions;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF p_decision NOT IN ('approved','rejected') OR p_reason IS NULL OR length(p_reason)>1000 OR
  (p_decision='rejected' AND length(btrim(p_reason))=0) THEN
  RAISE EXCEPTION 'invalid_application_decision' USING ERRCODE='22023';
 END IF;
 SELECT * INTO ordered FROM lzc.application_instances WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() FOR UPDATE;
 IF NOT FOUND OR ordered.requested_by=lzc.current_user_id() THEN
  RAISE EXCEPTION 'application_decision_access_denied' USING ERRCODE='42501';
 END IF;
 IF ordered.deployment_policy<>'approval-required' THEN
  RAISE EXCEPTION 'application_approval_not_required' USING ERRCODE='40001';
 END IF;
 SELECT * INTO existing FROM lzc.application_order_decisions WHERE instance_id=p_instance;
 IF FOUND THEN
  IF existing.decision<>p_decision OR existing.reason<>p_reason THEN
   RAISE EXCEPTION 'application_order_decision_conflict' USING ERRCODE='40001';
  END IF;
  RETURN;
 END IF;
 INSERT INTO lzc.application_order_decisions(instance_id,tenant_id,decision,decided_by,reason)
 VALUES(ordered.id,ordered.tenant_id,p_decision,lzc.current_user_id(),p_reason);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.decide_application_order(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.decide_application_order(uuid,uuid,text,text) TO configurator_app;

CREATE FUNCTION lzc.require_application_order_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; instance_id uuid;
BEGIN
 IF TG_TABLE_NAME IN ('application_job_claims','application_runner_tickets') THEN
  SELECT j.instance_id INTO instance_id FROM lzc.application_jobs j WHERE j.id=NEW.job_id AND j.tenant_id=NEW.tenant_id;
 ELSE instance_id=NEW.instance_id;
 END IF;
 SELECT * INTO ordered FROM lzc.application_instances i WHERE i.id=instance_id AND i.tenant_id=NEW.tenant_id;
 IF NOT FOUND OR (ordered.deployment_policy='approval-required' AND NOT EXISTS(
  SELECT 1 FROM lzc.application_order_decisions d WHERE d.instance_id=ordered.id AND d.tenant_id=ordered.tenant_id AND d.decision='approved'
 )) THEN
  RAISE EXCEPTION 'application_order_not_approved' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.require_application_order_approval() FROM PUBLIC;
CREATE TRIGGER application_order_approval BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.require_application_order_approval();
CREATE TRIGGER application_order_approval BEFORE INSERT ON lzc.application_job_grants FOR EACH ROW EXECUTE FUNCTION lzc.require_application_order_approval();
CREATE TRIGGER application_order_approval BEFORE INSERT ON lzc.application_job_claims FOR EACH ROW EXECUTE FUNCTION lzc.require_application_order_approval();
CREATE TRIGGER application_order_approval BEFORE INSERT ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc.require_application_order_approval();
CREATE TRIGGER application_order_approval BEFORE INSERT ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.require_application_order_approval();