-- Conditional S3 writes do not provide mutual exclusion on the qualified endpoint.
-- Bind each physical object to exactly one logical State before issuing credentials.
CREATE TABLE lzc.managed_state_targets (
 target_sha256 text PRIMARY KEY CHECK(target_sha256 ~ '^[a-f0-9]{64}$'),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_kind text NOT NULL CHECK(owner_kind IN ('platform','application')),
 owner_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE lzc.managed_state_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.managed_state_targets FORCE ROW LEVEL SECURITY;
CREATE POLICY managed_state_target_migration ON lzc.managed_state_targets TO configurator_migration USING(true) WITH CHECK(true);

CREATE FUNCTION lzc_auth.bind_managed_state_target(p_descriptor jsonb,p_tenant uuid,p_kind text,p_owner text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fingerprint text; bound lzc.managed_state_targets;
BEGIN
 IF p_descriptor->>'endpoint' IS NULL OR p_descriptor->>'bucket' IS NULL OR p_descriptor->>'key' IS NULL
 THEN RAISE EXCEPTION 'state_backend_binding_invalid' USING ERRCODE='40001'; END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_descriptor->>'endpoint',p_descriptor->>'bucket',p_descriptor->>'key')::text,'UTF8')),'hex');
 INSERT INTO lzc.managed_state_targets(target_sha256,tenant_id,owner_kind,owner_id)
 VALUES(fingerprint,p_tenant,p_kind,p_owner) ON CONFLICT DO NOTHING;
 SELECT * INTO bound FROM lzc.managed_state_targets WHERE target_sha256=fingerprint;
 IF bound.tenant_id<>p_tenant OR bound.owner_kind<>p_kind OR bound.owner_id<>p_owner
 THEN RAISE EXCEPTION 'state_backend_already_managed' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.bind_managed_state_target(jsonb,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION lzc.guard_managed_state_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE descriptor jsonb; backend uuid;
BEGIN
 IF TG_TABLE_NAME='platform_states' THEN
  FOREACH backend IN ARRAY ARRAY[NEW.backend_id,NEW.pending_backend_id] LOOP
   IF backend IS NULL THEN CONTINUE; END IF;
   SELECT b.descriptor INTO descriptor FROM lzc.state_backends b WHERE b.id=backend AND b.tenant_id=NEW.tenant_id;
   PERFORM lzc_auth.bind_managed_state_target(descriptor,NEW.tenant_id,'platform',NEW.state_key);
  END LOOP;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM lzc.application_job_grants g WHERE g.job_id=NEW.job_id AND g.tenant_id=NEW.tenant_id AND g.state_key=NEW.descriptor->>'key')
  THEN RAISE EXCEPTION 'state_backend_binding_invalid' USING ERRCODE='40001'; END IF;
  PERFORM lzc_auth.bind_managed_state_target(NEW.descriptor,NEW.tenant_id,'application',
   (SELECT instance_id::text FROM lzc.application_job_grants WHERE job_id=NEW.job_id));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_managed_state_target() FROM PUBLIC;
CREATE TRIGGER managed_platform_state_target BEFORE INSERT OR UPDATE OF backend_id,pending_backend_id ON lzc.platform_states
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_managed_state_target();
CREATE TRIGGER managed_application_state_target BEFORE INSERT ON lzc.application_job_backends
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_managed_state_target();

-- Conflicting historical registrations require operator review; never silently
-- assign one writer's existing State to another logical platform or application.
DO $$
DECLARE binding record;
BEGIN
 FOR binding IN
  SELECT b.descriptor,s.tenant_id,'platform'::text AS kind,s.state_key AS owner
  FROM lzc.platform_states s JOIN lzc.state_backends b ON b.id=s.backend_id OR b.id=s.pending_backend_id
  UNION ALL
  SELECT b.descriptor,b.tenant_id,'application',g.instance_id::text
  FROM lzc.application_job_backends b JOIN lzc.application_job_grants g ON g.job_id=b.job_id
 LOOP
  PERFORM lzc_auth.bind_managed_state_target(binding.descriptor,binding.tenant_id,binding.kind,binding.owner);
 END LOOP;
END $$;

-- Expiring a capability cannot stop a process that already received S3 credentials.
CREATE FUNCTION lzc.guard_platform_state_serialization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.state_key IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('managed-platform-state:'||NEW.state_key,0));
 IF EXISTS(SELECT 1 FROM lzc.plan_runs r WHERE r.state_key=NEW.state_key AND r.id<>NEW.id
  AND r.input_claimed AND r.status IN ('failed','cancelled') AND NOT r.cleaned
  AND NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_receipts receipt WHERE receipt.runner_id=r.id AND receipt.app_id=r.runner_app_id)
  AND NOT EXISTS(SELECT 1 FROM lzc.platform_reconciliations receipt WHERE receipt.run_id=r.id AND receipt.state_key=r.state_key))
 THEN RAISE EXCEPTION 'state_locked' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.guard_platform_state_serialization() FROM PUBLIC;
CREATE TRIGGER platform_state_serialization BEFORE INSERT ON lzc.plan_runs
 FOR EACH ROW EXECUTE FUNCTION lzc.guard_platform_state_serialization();

-- Reconciliation remains a durable hold for every operation, including drift
-- and destroy. Ticket expiry alone never proves that the previous writer stopped.
CREATE OR REPLACE FUNCTION lzc_auth.application_execution_blocked(p_job uuid,p_instance uuid,p_tenant uuid,p_purpose text,p_apply_only boolean DEFAULT false) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM lzc.application_dispatches d WHERE d.tenant_id=p_tenant AND d.instance_id=p_instance AND d.job_id<>p_job
   AND (NOT p_apply_only OR EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.id=d.job_id AND j.operation='apply'))
   AND (d.status NOT IN ('succeeded','failed','reconciliation_required') OR
    (d.status='reconciliation_required' AND NOT lzc_auth.application_recovery_replan_valid(d.job_id)))
 );
$$;
