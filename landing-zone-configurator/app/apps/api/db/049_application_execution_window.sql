CREATE FUNCTION lzc_auth.application_job_expiry(p_session uuid,p_instance uuid,p_session_expiry timestamptz)
RETURNS timestamptz LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN EXISTS(
    SELECT 1 FROM lzc.application_execution_delegations d WHERE d.platform_revision=v.platform_revision AND d.tenant_id=i.tenant_id AND d.revoked_at IS NULL
 ) THEN now()+interval '25 minutes' ELSE least(s.expires_at,p_session_expiry,human.valid_until,now()+interval '25 minutes') END
 FROM lzc.application_instances i JOIN lzc.application_template_versions v ON v.id=i.version_id AND v.tenant_id=i.tenant_id
 JOIN lzc_auth.sessions s ON s.id=p_session AND s.user_id=i.requested_by AND s.expires_at>now()
 JOIN lzc.stackit_identities human ON human.user_id=i.requested_by AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
 WHERE i.id=p_instance AND i.tenant_id=lzc.current_tenant_id() AND i.requested_by=lzc.current_user_id() AND coalesce(s.active_tenant_id,s.tenant_id)=i.tenant_id;
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_job_expiry(uuid,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_job_expiry(uuid,uuid,timestamptz) TO configurator_app;

CREATE FUNCTION lzc_auth.authorize_application_execution(p_session uuid,p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM lzc.application_job_delegations WHERE job_id=p_job) OR
    NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job AND approval_session_id=p_session AND consumed_at IS NOT NULL) THEN
    PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
    RETURN;
 END IF;
 IF NOT EXISTS(
    SELECT 1 FROM lzc.application_job_grants g
    JOIN lzc.application_runner_tickets ticket ON ticket.job_id=g.job_id AND ticket.tenant_id=g.tenant_id AND ticket.approval_session_id=p_session AND ticket.consumed_at IS NOT NULL AND ticket.expires_at>now()
    JOIN lzc_auth.sessions s ON s.id=p_session AND s.user_id=g.owner_user_id AND coalesce(s.active_tenant_id,s.tenant_id)=g.tenant_id
    JOIN lzc.memberships m ON m.tenant_id=g.tenant_id AND m.user_id=g.owner_user_id
    JOIN lzc.tenants t ON t.id=g.tenant_id AND t.archived_at IS NULL AND t.organization_verified AND t.organization_id=g.organization_id
    JOIN lzc.application_dispatches d ON d.job_id=g.job_id AND d.approval_session_id=p_session AND d.runner_package_id=ticket.runner_package_id AND d.status IN ('starting','initializing','validating','planning','applying')
    JOIN lzc.application_job_delegations jd ON jd.job_id=g.job_id AND jd.tenant_id=g.tenant_id
    JOIN lzc.application_execution_delegations binding ON binding.id=jd.delegation_id AND binding.tenant_id=g.tenant_id AND binding.revoked_at IS NULL
    WHERE g.job_id=p_job AND g.tenant_id=lzc.current_tenant_id() AND g.owner_user_id=lzc.current_user_id() AND g.revoked_at IS NULL AND g.expires_at>now()
     AND ('application-owner'=ANY(m.product_roles) OR 'platform-engineer'=ANY(m.product_roles))
 ) THEN RAISE EXCEPTION 'application_execution_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.authorize_application_execution(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.authorize_application_execution(uuid,uuid) TO configurator_app;

DO $$
DECLARE definition text;
 anchor text;
 replacement text;
BEGIN
 anchor := 'NEW.expires_at>least(s.expires_at,human.valid_until,now()+interval ''25 minutes'')';
 replacement := 'NEW.expires_at>(CASE WHEN EXISTS(SELECT 1 FROM lzc.application_execution_delegations d WHERE d.platform_revision=c.revision AND d.tenant_id=i.tenant_id AND d.revoked_at IS NULL) THEN now()+interval ''25 minutes'' ELSE least(s.expires_at,human.valid_until,now()+interval ''25 minutes'') END)';
 definition := pg_get_functiondef('lzc.issue_application_job_grant()'::regprocedure);
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,replacement);

 definition := pg_get_functiondef('lzc_auth.delegated_application_plan_context(uuid,uuid)'::regprocedure);
 anchor := 'PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),''order'');';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'PERFORM lzc_auth.authorize_application_execution(p_session,p_job);');
 anchor := 'PERFORM lzc_auth.require_active_application_order(p_session,grant_row.instance_id);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'IF EXISTS(SELECT 1 FROM lzc.application_order_deletions WHERE instance_id=grant_row.instance_id) THEN RAISE EXCEPTION ''application_order_deleted'' USING ERRCODE=''40001''; END IF;');
 anchor := 'human.valid_until>now()';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'(human.valid_until>now() OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets ticket WHERE ticket.job_id=p_job AND ticket.approval_session_id=p_session AND ticket.consumed_at IS NOT NULL AND ticket.expires_at>now()))');
 EXECUTE definition;

 definition := pg_get_functiondef('lzc_auth.application_apply_plan(uuid,uuid,text)'::regprocedure);
 anchor := 'lzc_auth.application_apply_plan(p_session uuid, p_plan uuid, p_sha text)';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'lzc_auth.application_running_apply_plan(p_session uuid, p_plan uuid, p_sha text, p_job uuid)');
 anchor := 'PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),''order'');';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'PERFORM lzc_auth.authorize_application_execution(p_session,p_job);
 IF NOT EXISTS(SELECT 1 FROM lzc.application_jobs WHERE id=p_job AND plan_id=p_plan AND artifact_sha256=p_sha AND tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id()) THEN RAISE EXCEPTION ''application_apply_plan_unavailable'' USING ERRCODE=''42501''; END IF;');
 anchor := 'PERFORM lzc_auth.require_active_application_order(p_session,planned.instance_id);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'IF EXISTS(SELECT 1 FROM lzc.application_order_deletions WHERE instance_id=planned.instance_id) THEN RAISE EXCEPTION ''application_order_deleted'' USING ERRCODE=''40001''; END IF;');
 EXECUTE definition;

 definition := pg_get_functiondef('lzc_auth.delegated_application_context(uuid,uuid)'::regprocedure);
 anchor := 'apply_context:=lzc_auth.application_apply_plan(p_session,job.plan_id,job.artifact_sha256);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 definition := replace(definition,anchor,'IF EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job AND approval_session_id=p_session AND consumed_at IS NOT NULL) THEN
     apply_context:=lzc_auth.application_running_apply_plan(p_session,job.plan_id,job.artifact_sha256,p_job);
    ELSE
     apply_context:=lzc_auth.application_apply_plan(p_session,job.plan_id,job.artifact_sha256);
    END IF;');
 EXECUTE definition;

 anchor := ' IF p_operation=''reserve'' THEN';
 replacement := ' IF p_operation=''reserve'' THEN
  IF dispatched.job_id IS NULL AND (context->>''expiresAt'')::timestamptz<now()+interval ''20 minutes'' THEN
   RAISE EXCEPTION ''application_execution_window_too_short'' USING ERRCODE=''42501'';
  END IF;';
 definition := pg_get_functiondef('lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'::regprocedure);
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'application_execution_window_anchor_missing'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $$;

REVOKE ALL ON FUNCTION lzc_auth.application_running_apply_plan(uuid,uuid,text,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_delegated_application_runner(p_hash text,p_package uuid,p_source text,p_lock text,p_report boolean)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,ticket.expires_at
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.application_jobs j ON j.id=ticket.job_id AND j.owner_user_id=s.user_id
 JOIN lzc.application_job_grants g ON g.job_id=j.id AND g.revoked_at IS NULL AND g.expires_at>now()
 JOIN lzc.application_job_delegations jd ON jd.job_id=j.id AND jd.tenant_id=j.tenant_id
 JOIN lzc.application_execution_delegations binding ON binding.id=jd.delegation_id AND binding.tenant_id=jd.tenant_id AND binding.revoked_at IS NULL
 JOIN lzc.application_dispatches d ON d.job_id=j.id AND d.runner_package_id=ticket.runner_package_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=j.tenant_id
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
    AND ticket.expires_at>now() AND (s.expires_at>now() OR p_report) AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id
    AND ('application-owner'=ANY(m.product_roles) OR 'platform-engineer'=ANY(m.product_roles))
    AND (ticket.consumed_at IS NOT NULL)=p_report AND d.status IN ('starting','initializing','validating','planning','applying');
$$;