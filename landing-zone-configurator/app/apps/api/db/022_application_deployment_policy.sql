ALTER TABLE lzc.application_template_versions ADD COLUMN deployment_policy text NOT NULL DEFAULT 'approval-required'
 CHECK(deployment_policy IN ('approval-required','direct'));
ALTER TABLE lzc.application_instances ADD COLUMN deployment_policy text NOT NULL DEFAULT 'approval-required'
 CHECK(deployment_policy IN ('approval-required','direct'));
CREATE TRIGGER immutable_application_policy BEFORE UPDATE OF deployment_policy ON lzc.application_instances
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE OR REPLACE FUNCTION lzc.lock_application_availability() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE published_policy text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('application-availability:' || NEW.tenant_id::text || ':' || NEW.version_id::text,0));
 IF TG_TABLE_NAME='application_instances' THEN
  IF EXISTS(SELECT 1 FROM lzc.application_template_retirements r WHERE r.tenant_id=NEW.tenant_id AND r.version_id=NEW.version_id)
   THEN RAISE EXCEPTION 'template_version_retired' USING ERRCODE='55000'; END IF;
  SELECT v.deployment_policy INTO STRICT published_policy FROM lzc.application_template_versions v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.version_id;
  IF NEW.deployment_policy<>published_policy THEN RAISE EXCEPTION 'application_policy_mismatch' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;