CREATE FUNCTION lzc_auth.application_runner_input_context(p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; job lzc.application_jobs; approved lzc.application_job_backends;
BEGIN
 context:=lzc_auth.application_job_credential_context(p_session,p_job);
 SELECT * INTO job FROM lzc.application_jobs WHERE id=p_job AND tenant_id=lzc.current_tenant_id();
 IF NOT FOUND OR job.inputs->>'acceleratorRevision' IS DISTINCT FROM context->>'acceleratorRevision' OR
  job.inputs->>'stateKey' IS DISTINCT FROM 'applications/' || job.tenant_id::text || '/' || job.instance_id::text || '/terraform.tfstate' OR
  job.inputs->>'requestedBy' IS DISTINCT FROM job.owner_user_id::text OR job.operation<>'plan' THEN
  RAISE EXCEPTION 'application_runner_inputs_invalid' USING ERRCODE='42501';
 END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_runner_backend_unavailable' USING ERRCODE='42501'; END IF;
 RETURN context || jsonb_build_object('tenantId',job.tenant_id,'instanceId',job.instance_id,
  'variables',job.inputs->'variables','backendId',approved.backend_id,'descriptor',approved.descriptor);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_runner_input_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_runner_input_context(uuid,uuid) TO configurator_app;
CREATE TABLE lzc.application_runner_tickets (
 job_id uuid PRIMARY KEY REFERENCES lzc.application_job_backends(job_id),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 approval_session_id uuid NOT NULL,
 ticket_hash text NOT NULL UNIQUE CHECK(ticket_hash ~ '^[A-Za-z0-9_-]{43}$'),
 runner_package_id uuid NOT NULL,
 accelerator_revision text NOT NULL CHECK(accelerator_revision='c4b43c36af198985980b17626c48d357795e3fbd'),
 provider_lock_sha256 text NOT NULL CHECK(provider_lock_sha256='d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5'),
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>issued_at),
 consumed_at timestamptz
);
ALTER TABLE lzc.application_runner_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_runner_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY application_ticket_migration ON lzc.application_runner_tickets TO configurator_migration USING(true) WITH CHECK(true);

CREATE FUNCTION lzc.guard_application_runner_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at') OR
  OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
  RAISE EXCEPTION 'immutable_application_runner_ticket' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_application_runner_ticket BEFORE UPDATE OR DELETE ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_runner_ticket();

CREATE FUNCTION lzc_auth.issue_application_runner_ticket(p_session uuid,p_job uuid,p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; approved lzc.application_job_backends;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.accelerator_revision IS DISTINCT FROM p_source OR EXISTS(
  SELECT 1 FROM lzc.application_job_claims WHERE job_id=p_job
 ) OR NOT EXISTS(
  SELECT 1 FROM lzc.tenants t WHERE t.id=g.tenant_id AND t.organization_id=g.organization_id AND t.organization_verified AND t.archived_at IS NULL
 ) THEN RAISE EXCEPTION 'application_runner_binding_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job AND approval_session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_runner_session_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM lzc_auth.approve_application_job_backend(p_session,p_job,approved.backend_id);
 IF EXISTS(SELECT 1 FROM lzc.application_runner_tickets WHERE job_id=p_job) THEN
  RAISE EXCEPTION 'application_runner_ticket_already_issued' USING ERRCODE='40001';
 END IF;
 INSERT INTO lzc.application_runner_tickets(job_id,tenant_id,approval_session_id,ticket_hash,runner_package_id,accelerator_revision,provider_lock_sha256,expires_at)
 VALUES(p_job,g.tenant_id,p_session,p_hash,p_package,p_source,p_lock,approved.expires_at);
 RETURN approved.expires_at;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.issue_application_runner_ticket(uuid,uuid,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.issue_application_runner_ticket(uuid,uuid,text,uuid,text,text) TO configurator_app;

CREATE FUNCTION lzc_auth.resolve_application_runner_ticket(p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,least(s.expires_at,ticket.expires_at)
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=ticket.tenant_id
 JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
  AND ticket.expires_at>now() AND ticket.consumed_at IS NULL AND s.expires_at>now()
  AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id AND 'platform-engineer'=ANY(m.product_roles);
$$;
REVOKE ALL ON FUNCTION lzc_auth.resolve_application_runner_ticket(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.resolve_application_runner_ticket(text,uuid,text,text) TO configurator_app;

CREATE FUNCTION lzc_auth.consume_application_runner_ticket(p_session uuid,p_job uuid,p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 UPDATE lzc.application_runner_tickets SET consumed_at=now()
 WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approval_session_id=p_session AND ticket_hash=p_hash
  AND runner_package_id=p_package AND accelerator_revision=p_source AND provider_lock_sha256=p_lock
  AND expires_at>now() AND consumed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_runner_ticket_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.consume_application_runner_ticket(uuid,uuid,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.consume_application_runner_ticket(uuid,uuid,text,uuid,text,text) TO configurator_app;