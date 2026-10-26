-- No configured limit preserves existing admission. Published templates and
-- existing reservations/entitlements are never rewritten when a limit changes.
CREATE TABLE lzc.application_order_quota_revisions (
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
 max_reserved_orders integer CHECK(max_reserved_orders BETWEEN 0 AND 1000000),
 changed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,revision)
);
REVOKE ALL ON lzc.application_order_quota_revisions FROM PUBLIC,configurator_app;
CREATE TRIGGER immutable_application_order_quota_revision BEFORE UPDATE OR DELETE
 ON lzc.application_order_quota_revisions FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

-- Only return an aggregate. The runtime's Application Owner RLS view intentionally
-- excludes other requesters and must never be used for authoritative admission.
CREATE FUNCTION lzc_auth.application_reserved_order_count(p_tenant uuid) RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(*) FROM lzc.application_instances i WHERE i.tenant_id=p_tenant
 AND NOT EXISTS(
  SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.tenant_id=i.tenant_id AND deleted.instance_id=i.id
  AND (
   NOT EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.instance_id=i.id AND j.operation='apply')
   OR EXISTS(
    SELECT 1 FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id
    WHERE j.instance_id=i.id AND j.operation='apply' AND j.inputs->>'purpose'='destroy'
     AND d.status='succeeded' AND d.finished_at IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=i.id AND newer.operation='apply'
       AND (newer.created_at,newer.id)>(j.created_at,j.id))
   )
  )
 );
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_reserved_order_count(uuid) FROM PUBLIC,configurator_app;

CREATE FUNCTION lzc_auth.application_order_quota(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE configured lzc.application_order_quota_revisions;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'read');
 SELECT * INTO configured FROM lzc.application_order_quota_revisions WHERE tenant_id=lzc.current_tenant_id() ORDER BY revision DESC LIMIT 1;
 RETURN jsonb_build_object('maxReservedOrders',configured.max_reserved_orders,'revision',coalesce(configured.revision,0),
   'reservedOrders',lzc_auth.application_reserved_order_count(lzc.current_tenant_id()));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.application_order_quota(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.application_order_quota(uuid) TO configurator_app;

CREATE FUNCTION lzc_auth.set_application_order_quota(p_session uuid,p_limit integer,p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_revision integer;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 IF p_expected IS NULL OR p_expected<0 OR p_expected>2147483645 OR (p_limit IS NOT NULL AND (p_limit<0 OR p_limit>1000000)) THEN
  RAISE EXCEPTION 'invalid_application_order_quota' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-order-quota:'||lzc.current_tenant_id()::text,0));
 SELECT coalesce(max(revision),0) INTO current_revision FROM lzc.application_order_quota_revisions WHERE tenant_id=lzc.current_tenant_id();
 IF current_revision<>p_expected THEN RAISE EXCEPTION 'application_order_quota_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO lzc.application_order_quota_revisions(tenant_id,revision,max_reserved_orders,changed_by)
 VALUES(lzc.current_tenant_id(),current_revision+1,p_limit,lzc.current_user_id());
 RETURN lzc_auth.application_order_quota(p_session);
END $$;
REVOKE ALL ON FUNCTION lzc_auth.set_application_order_quota(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.set_application_order_quota(uuid,integer,integer) TO configurator_app;

CREATE FUNCTION lzc.admit_application_order_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE configured_limit integer;
BEGIN
 -- RLS still validates requester/context. Validate before the private aggregate
 -- to prevent cross-tenant inserts from being a quota oracle.
 IF NEW.tenant_id IS DISTINCT FROM lzc.current_tenant_id() OR NEW.requested_by IS DISTINCT FROM lzc.current_user_id()
  OR NOT (lzc.application_role('platform-engineer') OR lzc.application_role('application-owner')) THEN
  RAISE EXCEPTION 'application_access_denied' USING ERRCODE='42501';
 END IF;
 -- Existing replay returns before INSERT; serialize only new reservations and
 -- policy updates. This lock never acquires publication or per-instance locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('application-order-quota:'||NEW.tenant_id::text,0));
 SELECT max_reserved_orders INTO configured_limit FROM lzc.application_order_quota_revisions WHERE tenant_id=NEW.tenant_id ORDER BY revision DESC LIMIT 1;
 IF configured_limit IS NOT NULL AND lzc_auth.application_reserved_order_count(NEW.tenant_id)>=configured_limit THEN
  RAISE EXCEPTION 'application_order_quota_exceeded' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lzc.admit_application_order_quota() FROM PUBLIC,configurator_app;
CREATE TRIGGER application_order_quota_admission BEFORE INSERT ON lzc.application_instances
 FOR EACH ROW EXECUTE FUNCTION lzc.admit_application_order_quota();
