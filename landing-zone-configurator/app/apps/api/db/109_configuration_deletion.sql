-- Deletion removes saved drafts, never State or immutable execution evidence.
-- Inspect the whole tenant, not the current user's RLS-limited execution list.
CREATE FUNCTION lzc_auth.deletion_blocker(p_tenant uuid,p_configuration uuid DEFAULT NULL) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH states AS (
  SELECT s.* FROM lzc.platform_states s WHERE s.tenant_id=p_tenant AND (
   p_configuration IS NULL OR s.configuration_id=p_configuration::text OR
   EXISTS(SELECT 1 FROM lzc.state_configuration_aliases a WHERE a.tenant_id=p_tenant AND a.state_key=s.state_key AND a.configuration_id=p_configuration::text) OR
   EXISTS(SELECT 1 FROM lzc.plan_runs r JOIN lzc.deployment_preparations p ON p.id=r.preparation_id
    WHERE r.tenant_id=p_tenant AND r.state_key=s.state_key AND p.manifest#>>'{source,configurationId}'=p_configuration::text)
  )
 ), runs AS (
  SELECT r.* FROM lzc.plan_runs r JOIN lzc.deployment_preparations p ON p.id=r.preparation_id
  WHERE r.tenant_id=p_tenant AND (p_configuration IS NULL OR p.manifest#>>'{source,configurationId}'=p_configuration::text OR r.state_key IN (SELECT state_key FROM states))
 ), applications AS (
  SELECT i.* FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id
  WHERE i.tenant_id=p_tenant AND (p_configuration IS NULL OR EXISTS(
   SELECT 1 FROM lzc.application_platform_sources source WHERE source.tenant_id=p_tenant AND source.state_key IN (SELECT state_key FROM states)
    AND source.revision IN (v.platform_revision,lzc_auth.effective_application_platform_revision(i.id))))
 )
 SELECT CASE
 WHEN EXISTS(SELECT 1 FROM runs r WHERE r.status IN ('starting','initializing','validating','planning','applying','recovery_required') OR
  (r.input_claimed AND NOT r.cleaned AND r.status IN ('failed','cancelled') AND
   NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=r.id AND receipt.app_id=r.runner_app_id) AND
   NOT EXISTS(SELECT 1 FROM lzc.platform_reconciliations receipt WHERE receipt.run_id=r.id))) OR
  EXISTS(SELECT 1 FROM states WHERE lock_run_id IS NOT NULL OR pending_backend_id IS NOT NULL) OR
  EXISTS(SELECT 1 FROM applications i WHERE jsonb_array_length(lzc_auth.application_execution_blockers(i.id))>0)
 THEN 'execution_active'
 WHEN EXISTS(SELECT 1 FROM states s WHERE s.version>0 AND NOT EXISTS(
  SELECT 1 FROM lzc.platform_retirements retired WHERE retired.tenant_id=p_tenant AND retired.state_key=s.state_key AND retired.phase='COMPLETE')) OR
  EXISTS(SELECT 1 FROM runs r WHERE r.operation='apply' AND (r.input_claimed OR r.runner_app_id IS NOT NULL OR r.status IN ('succeeded','recovery_required')) AND NOT EXISTS(
   SELECT 1 FROM lzc.platform_retirements retired WHERE retired.tenant_id=p_tenant AND retired.state_key=r.state_key AND retired.phase='COMPLETE')) OR
  EXISTS(SELECT 1 FROM applications i WHERE EXISTS(
   SELECT 1 FROM lzc.application_jobs j WHERE j.instance_id=i.id AND j.operation='apply' AND (
    EXISTS(SELECT 1 FROM lzc.application_job_claims c WHERE c.job_id=j.id) OR
    EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=j.id) OR
    EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=j.id))) AND NOT EXISTS(
   SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id
   WHERE j.instance_id=i.id AND j.operation='apply' AND j.inputs->>'purpose'='destroy' AND d.status='succeeded' AND d.finished_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=i.id AND newer.operation='apply' AND (newer.created_at,newer.id)>(j.created_at,j.id))))
 THEN 'instance_exists'
 ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION lzc_auth.deletion_blocker(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION lzc.configuration_deletion_blocker(p_id uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.deletion_blocker(c.tenant_id,c.id) FROM lzc.configurations c
 WHERE c.id=p_id AND c.tenant_id=lzc.current_tenant_id() AND lzc.application_role('platform-engineer');
$$;
REVOKE ALL ON FUNCTION lzc.configuration_deletion_blocker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.configuration_deletion_blocker(uuid) TO configurator_app;

CREATE FUNCTION lzc.lock_configuration_deletion() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT lzc.application_role('platform-engineer') THEN RAISE EXCEPTION 'configuration_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.retirement_lock();
END $$;
REVOKE ALL ON FUNCTION lzc.lock_configuration_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.lock_configuration_deletion() TO configurator_app;

CREATE FUNCTION lzc.guard_configuration_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE blocker text;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 blocker:=lzc_auth.deletion_blocker(OLD.tenant_id,OLD.id);
 IF blocker IS NOT NULL THEN RAISE EXCEPTION 'configuration_%',blocker USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_configuration_deletion() FROM PUBLIC;
CREATE TRIGGER configuration_deletion BEFORE DELETE ON lzc.configurations FOR EACH ROW EXECUTE FUNCTION lzc.guard_configuration_deletion();

-- The admission fence is shared with deletion, including background dispatch
-- and capability consumption after the original browser session has ended.
CREATE FUNCTION lzc.guard_deleted_configuration_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run lzc.plan_runs; prepared jsonb; tenant uuid;
BEGIN
 PERFORM lzc_auth.retirement_lock();
 tenant:=NEW.tenant_id;
 IF NOT EXISTS(SELECT 1 FROM lzc.tenants t WHERE t.id=tenant AND t.archived_at IS NULL) THEN
  RAISE EXCEPTION 'workspace_deleted' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME IN ('plan_runs','plan_credential_grants') THEN
  IF TG_TABLE_NAME='plan_runs' THEN run:=NEW; ELSE SELECT * INTO run FROM lzc.plan_runs WHERE id=NEW.run_id; END IF;
  SELECT p.manifest INTO prepared FROM lzc.deployment_preparations p WHERE p.id=run.preparation_id;
  IF prepared#>>'{source,kind}'='database' AND NOT EXISTS(SELECT 1 FROM lzc.configurations c WHERE c.tenant_id=tenant AND c.id::text=prepared#>>'{source,configurationId}') THEN
   RAISE EXCEPTION 'configuration_not_found' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_deleted_configuration_admission() FROM PUBLIC;
CREATE TRIGGER deleted_configuration BEFORE INSERT ON lzc.plan_runs FOR EACH ROW EXECUTE FUNCTION lzc.guard_deleted_configuration_admission();
CREATE TRIGGER deleted_configuration_claim BEFORE UPDATE OF input_claimed ON lzc.plan_runs FOR EACH ROW WHEN(NOT OLD.input_claimed AND NEW.input_claimed) EXECUTE FUNCTION lzc.guard_deleted_configuration_admission();
CREATE TRIGGER deleted_configuration_dispatch BEFORE UPDATE OF runner_app_id ON lzc.plan_runs FOR EACH ROW WHEN(OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL) EXECUTE FUNCTION lzc.guard_deleted_configuration_admission();
CREATE TRIGGER deleted_configuration_credential BEFORE UPDATE OF consumed_at ON lzc.plan_credential_grants FOR EACH ROW WHEN(OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL) EXECUTE FUNCTION lzc.guard_deleted_configuration_admission();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['application_instances','application_jobs','application_runner_tickets','application_job_claims','application_job_backends','application_dispatches','application_job_grants','application_platform_contracts','application_platform_sources','application_template_versions'] LOOP
  EXECUTE format('CREATE TRIGGER deleted_workspace BEFORE INSERT ON lzc.%I FOR EACH ROW EXECUTE FUNCTION lzc.guard_deleted_configuration_admission()',tab);
 END LOOP;
END $$;
CREATE TRIGGER deleted_workspace_consume BEFORE UPDATE OF consumed_at ON lzc.application_runner_tickets FOR EACH ROW WHEN(OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL) EXECUTE FUNCTION lzc.guard_deleted_configuration_admission();

CREATE OR REPLACE FUNCTION lzc_auth.archive_organisation(p_session uuid,p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; blocker text;
BEGIN
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 PERFORM 1 FROM lzc.tenants WHERE id=p_tenant AND kind='organisation' AND archived_at IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lzc.memberships WHERE tenant_id=p_tenant AND user_id=actor AND manage_members AND 'platform-engineer'=ANY(product_roles)) THEN
  RAISE EXCEPTION 'organisation_archive_forbidden' USING ERRCODE='42501'; END IF;
 -- Do not wait for an admitted writer while holding the tenant row: its
 -- remaining authorization checks may need a share lock on this same row.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('lzc:retirement-admission',0)) THEN
  RAISE EXCEPTION 'workspace_execution_active' USING ERRCODE='55000'; END IF;
 blocker:=lzc_auth.deletion_blocker(p_tenant);
 IF blocker IS NOT NULL THEN RAISE EXCEPTION 'workspace_%',blocker USING ERRCODE='55000'; END IF;
 DELETE FROM lzc.configurations WHERE tenant_id=p_tenant;
 UPDATE lzc.tenants SET archived_at=now() WHERE id=p_tenant;
 UPDATE lzc_auth.sessions SET active_tenant_id=NULL WHERE active_tenant_id=p_tenant;
 UPDATE lzc_auth.invitations SET revoked_at=now() WHERE tenant_id=p_tenant AND revoked_at IS NULL AND accepted_at IS NULL;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,subject_id,action) VALUES(p_tenant,actor,actor,'organisation_archived');
END $$;

CREATE OR REPLACE FUNCTION lzc.protect_application_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND lzc_auth.deletion_blocker(NEW.id) IS NOT NULL THEN
  RAISE EXCEPTION 'workspace_instance_exists' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;

DO $$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('lzc_auth.organisation_overview(uuid)'::regprocedure);
 old:='t.kind=''organisation'' AND NOT t.organization_verified AND m.manage_members AND EXISTS(SELECT 1 FROM lzc_auth.membership_audit a WHERE a.tenant_id=t.id AND a.action=''organisation_created'' AND a.actor_id=s.user_id)';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'workspace_archive_overview_contract_changed'; END IF;
 EXECUTE replace(definition,old,'t.kind=''organisation'' AND m.manage_members AND ''platform-engineer''=ANY(m.product_roles)');
END $$;
