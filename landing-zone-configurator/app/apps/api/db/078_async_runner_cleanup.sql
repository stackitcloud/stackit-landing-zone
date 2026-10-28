-- CF DELETE is asynchronous. Keep a durable, scoped confirmation queue even
-- when the app disappears only after the short immediate observation window.
CREATE TABLE lzc.runner_cleanup_pending (
 app_id uuid PRIMARY KEY,
 runner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('plan','warm')),
 space_id uuid NOT NULL,
 origin text NOT NULL CHECK(length(origin) BETWEEN 1 AND 2048),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_checked_at timestamptz
);
CREATE INDEX runner_cleanup_pending_scope ON lzc.runner_cleanup_pending(space_id,origin,last_checked_at,requested_at,app_id);
ALTER TABLE lzc.runner_cleanup_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.runner_cleanup_pending FORCE ROW LEVEL SECURITY;
CREATE POLICY runner_cleanup_pending_migration ON lzc.runner_cleanup_pending TO configurator_migration USING(true) WITH CHECK(true);

CREATE FUNCTION lzc_auth.record_runner_cleanup_intent(p_runner uuid,p_app uuid,p_kind text,p_space uuid,p_origin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_kind NOT IN ('plan','warm') OR lzc_auth.runner_cleanup_disposition(p_runner,p_app,p_kind) NOT IN ('completed','orphan') THEN
  RAISE EXCEPTION 'runner_cleanup_protected' USING ERRCODE='42501';
 END IF;
 INSERT INTO lzc.runner_cleanup_pending(app_id,runner_id,kind,space_id,origin)
 VALUES(p_app,p_runner,p_kind,p_space,p_origin) ON CONFLICT(app_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM lzc.runner_cleanup_pending WHERE app_id=p_app AND runner_id=p_runner AND kind=p_kind AND space_id=p_space AND origin=p_origin) THEN
  RAISE EXCEPTION 'runner_cleanup_scope_changed' USING ERRCODE='40001';
 END IF;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.record_runner_cleanup_intent(uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.record_runner_cleanup_intent(uuid,uuid,text,uuid,text) TO configurator_app;

CREATE FUNCTION lzc_auth.pending_runner_cleanups(p_space uuid,p_origin text) RETURNS TABLE(app_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH selected AS (
  SELECT p.app_id FROM lzc.runner_cleanup_pending p WHERE p.space_id=p_space AND p.origin=p_origin
  ORDER BY p.last_checked_at NULLS FIRST,p.requested_at,p.app_id LIMIT 50 FOR UPDATE SKIP LOCKED
 ) UPDATE lzc.runner_cleanup_pending p SET last_checked_at=clock_timestamp() FROM selected s WHERE p.app_id=s.app_id RETURNING p.app_id;
$$;
REVOKE ALL ON FUNCTION lzc_auth.pending_runner_cleanups(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.pending_runner_cleanups(uuid,text) TO configurator_app;

CREATE FUNCTION lzc_auth.confirm_runner_cleanup(p_app uuid,p_space uuid,p_origin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO lzc.runner_cleanup_receipts(app_id,runner_id,kind)
 SELECT app_id,runner_id,kind FROM lzc.runner_cleanup_pending WHERE app_id=p_app AND space_id=p_space AND origin=p_origin ON CONFLICT(app_id) DO NOTHING;
 DELETE FROM lzc.runner_cleanup_pending WHERE app_id=p_app AND space_id=p_space AND origin=p_origin;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.confirm_runner_cleanup(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.confirm_runner_cleanup(uuid,uuid,text) TO configurator_app;
