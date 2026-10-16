-- Plan-only. No apply state or command is accepted by this schema.
CREATE TABLE lzc.plan_runs (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 owner_user_id uuid NOT NULL REFERENCES lzc_auth.users(id),
 preparation_id uuid NOT NULL REFERENCES lzc.deployment_preparations(id),
 status text NOT NULL DEFAULT 'starting' CHECK(status IN ('starting','initializing','validating','planning','succeeded','failed','cancelled')),
 ticket_hash text NOT NULL UNIQUE,
 input_claimed boolean NOT NULL DEFAULT false,
 summary jsonb,
 error_code text,
 runner_app_id uuid,
 cleaned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '25 minutes',
 finished_at timestamptz,
 CHECK(summary IS NULL OR (jsonb_typeof(summary)='object' AND summary->>'applyAllowed'='false'))
);
CREATE UNIQUE INDEX plan_one_active_owner ON lzc.plan_runs(tenant_id,owner_user_id)
 WHERE status IN ('starting','initializing','validating','planning');
CREATE INDEX plan_owner ON lzc.plan_runs(tenant_id,owner_user_id,created_at DESC);
ALTER TABLE lzc.plan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.plan_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY own_plan ON lzc.plan_runs TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND EXISTS(
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id=plan_runs.tenant_id AND m.user_id=lzc.current_user_id()))
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND owner_user_id=lzc.current_user_id() AND EXISTS(
 SELECT 1 FROM lzc.memberships m WHERE m.tenant_id=plan_runs.tenant_id AND m.user_id=lzc.current_user_id() AND m.role IN ('admin','deployer')) AND EXISTS(
 SELECT 1 FROM lzc.deployment_preparations p WHERE p.id=preparation_id AND p.tenant_id=lzc.current_tenant_id() AND p.owner_user_id=lzc.current_user_id()));
CREATE POLICY migrate_plan ON lzc.plan_runs TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON lzc.plan_runs TO configurator_app;
GRANT UPDATE(status,input_claimed,summary,error_code,runner_app_id,cleaned,finished_at) ON lzc.plan_runs TO configurator_app;

-- Capability lookup exposes only the identity for one live job with the exact random ticket.
CREATE FUNCTION lzc_auth.resolve_plan_ticket(p_hash text)
 RETURNS TABLE(id uuid,tenant_id uuid,owner_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 SELECT r.id,r.tenant_id,r.owner_user_id FROM lzc.plan_runs r
 WHERE r.ticket_hash=p_hash AND r.expires_at>now()
 AND r.status IN ('starting','initializing','validating','planning')
 $$;
REVOKE ALL ON FUNCTION lzc_auth.resolve_plan_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.resolve_plan_ticket(text) TO configurator_app;

-- Maintenance is deliberately narrow: expiry + finite cleanup list, no configs or secrets.
CREATE FUNCTION lzc_auth.expire_plan_runs()
 RETURNS TABLE(id uuid,runner_app_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 BEGIN
 UPDATE lzc.plan_runs SET status='failed',error_code='timed_out',finished_at=now()
 WHERE expires_at<=now() AND status IN ('starting','initializing','validating','planning');
 RETURN QUERY SELECT r.id,r.runner_app_id FROM lzc.plan_runs r
 WHERE NOT r.cleaned AND r.finished_at<now()-interval '30 seconds'
 ORDER BY r.finished_at LIMIT 20;
 END $$;
REVOKE ALL ON FUNCTION lzc_auth.expire_plan_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.expire_plan_runs() TO configurator_app;
CREATE FUNCTION lzc_auth.mark_plan_cleaned(p_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,lzc AS $$
 UPDATE lzc.plan_runs SET cleaned=true WHERE id=p_id AND finished_at IS NOT NULL
 $$;
REVOKE ALL ON FUNCTION lzc_auth.mark_plan_cleaned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.mark_plan_cleaned(uuid) TO configurator_app;
