CREATE TABLE lzc.application_dispatches (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_job_grants(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 instance_id uuid NOT NULL REFERENCES lzc.application_instances(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 approved_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 approval_session_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','starting','failed','reconciliation_required')),
 runner_app_id uuid,
 runner_package_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 CHECK((status IN ('failed','reconciliation_required'))=(finished_at IS NOT NULL)),
 CHECK((runner_app_id IS NULL)=(runner_package_id IS NULL))
);
CREATE UNIQUE INDEX application_active_dispatch ON lzc.application_dispatches(tenant_id,instance_id) WHERE status IN ('reserved','starting','reconciliation_required');
ALTER TABLE lzc.application_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY application_dispatch_read ON lzc.application_dispatches FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((owner_user_id=lzc.current_user_id() AND lzc.application_role('application-owner')) OR (approved_by=lzc.current_user_id() AND lzc.application_role('platform-engineer'))));
CREATE POLICY application_dispatch_migration ON lzc.application_dispatches TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_dispatches TO configurator_app;

CREATE FUNCTION lzc.guard_application_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','runner_app_id','runner_package_id','finished_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','runner_app_id','runner_package_id','finished_at']) OR
    OLD.status IN ('failed','reconciliation_required') OR NOT ((OLD.status='reserved' AND NEW.status='starting' AND OLD.runner_app_id IS NULL AND NEW.runner_app_id IS NOT NULL) OR
    (NEW.status IN ('failed','reconciliation_required') AND NEW.runner_app_id IS NOT DISTINCT FROM OLD.runner_app_id AND NEW.runner_package_id IS NOT DISTINCT FROM OLD.runner_package_id)) THEN
  RAISE EXCEPTION 'immutable_application_dispatch' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_application_dispatch BEFORE UPDATE OR DELETE ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_dispatch();

CREATE FUNCTION lzc_auth.reserve_application_dispatch(p_session uuid,p_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; approved lzc.application_job_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.accelerator_revision<>'c4b43c36af198985980b17626c48d357795e3fbd' OR NOT EXISTS(
  SELECT 1 FROM lzc.tenants t WHERE t.id=g.tenant_id AND t.organization_id=g.organization_id AND t.organization_verified AND t.archived_at IS NULL
 ) THEN RAISE EXCEPTION 'application_dispatch_grant_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_session_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,approved.backend_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('application-dispatch:' || g.tenant_id::text || ':' || g.instance_id::text,0));
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE job_id=p_job) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job) OR EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_dispatch_grant_consumed' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=g.tenant_id AND instance_id=g.instance_id AND status IN ('reserved','starting','reconciliation_required')) THEN
  RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id)
 VALUES(g.job_id,g.tenant_id,g.instance_id,g.owner_user_id,g.approved_by,p_session);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.reserve_application_dispatch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.reserve_application_dispatch(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.bind_application_dispatch(p_session uuid,p_job uuid,p_app uuid,p_package uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 UPDATE lzc.application_dispatches d SET status='starting',runner_app_id=p_app,runner_package_id=p_package
 WHERE d.job_id=p_job AND d.tenant_id=lzc.current_tenant_id() AND d.approved_by=lzc.current_user_id() AND d.approval_session_id=p_session AND d.status='reserved'
  AND EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=d.job_id AND ticket.runner_package_id=p_package AND ticket.expires_at>now() AND ticket.consumed_at IS NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'application_dispatch_binding_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.bind_application_dispatch(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.bind_application_dispatch(uuid,uuid,uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.fail_application_dispatch(p_session uuid,p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 UPDATE lzc.application_dispatches SET status=CASE WHEN runner_app_id IS NULL THEN 'failed' ELSE 'reconciliation_required' END,finished_at=now()
 WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() AND approval_session_id=p_session AND status IN ('reserved','starting');
END $$;
REVOKE ALL ON FUNCTION lzc_auth.fail_application_dispatch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.fail_application_dispatch(uuid,uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.assert_application_runner_ticket_current(p_session uuid,p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=p_job AND ticket.tenant_id=lzc.current_tenant_id() AND ticket.approval_session_id=p_session AND ticket.consumed_at IS NOT NULL AND ticket.expires_at>now()) OR EXISTS(
    SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=p_job AND d.status<>'starting'
 ) THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.assert_application_runner_ticket_current(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.assert_application_runner_ticket_current(uuid,uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_application_runner_ticket(p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,least(s.expires_at,ticket.expires_at)
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=ticket.tenant_id
 JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
    AND ticket.expires_at>now() AND ticket.consumed_at IS NULL AND s.expires_at>now()
    AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id AND 'platform-engineer'=ANY(m.product_roles)
    AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=ticket.job_id AND d.status<>'starting');
$$;