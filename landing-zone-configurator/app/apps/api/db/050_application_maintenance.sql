ALTER TABLE lzc.application_jobs ADD CONSTRAINT application_plan_purpose CHECK(coalesce(inputs->>'purpose','standard') IN ('standard','destroy','drift') AND (operation='plan' OR coalesce(inputs->>'purpose','standard')<>'drift'));

DROP INDEX lzc.application_active_dispatch;
CREATE UNIQUE INDEX application_active_dispatch ON lzc.application_dispatches(tenant_id,instance_id) WHERE status NOT IN ('succeeded','failed','reconciliation_required');

CREATE FUNCTION lzc_auth.application_execution_blocked(p_job uuid,p_instance uuid,p_tenant uuid,p_purpose text,p_apply_only boolean DEFAULT false) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM lzc.application_dispatches d WHERE d.tenant_id=p_tenant AND d.instance_id=p_instance AND d.job_id<>p_job
    AND (NOT p_apply_only OR EXISTS(SELECT 1 FROM lzc.application_jobs job WHERE job.id=d.job_id AND job.operation='apply'))
   AND (d.status NOT IN ('succeeded','failed','reconciliation_required') OR (d.status='reconciliation_required' AND NOT (
    p_purpose IN ('destroy','drift') AND d.finished_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=d.job_id AND t.expires_at>now())
    AND NOT EXISTS(SELECT 1 FROM lzc.application_runner_records r WHERE r.job_id=d.job_id AND r.kind='recovery')
   )))
 );
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_execution_blocked(uuid,uuid,uuid,text,boolean) FROM PUBLIC;

DO $$
DECLARE definition text; original text; replacement text; signature text;
BEGIN
 signature:='lzc_auth.validate_application_apply()';
 SELECT pg_get_functiondef('lzc.validate_application_apply()'::regprocedure) INTO definition;
 original:='IF EXISTS(SELECT 1 FROM lzc.application_dispatches d JOIN lzc.application_jobs j ON j.id=d.job_id WHERE d.instance_id=NEW.instance_id AND d.tenant_id=NEW.tenant_id AND j.operation=''apply'' AND d.status NOT IN (''succeeded'',''failed'')) THEN';
 replacement:='IF lzc_auth.application_execution_blocked(NEW.id,NEW.instance_id,NEW.tenant_id,coalesce(NEW.inputs->>''purpose'',''standard'')) THEN';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'application maintenance trigger source mismatch'; END IF;
 EXECUTE replace(definition,original,replacement);

 SELECT pg_get_functiondef('lzc_auth.delegated_application_plan_operation(uuid,uuid,text,jsonb)'::regprocedure) INTO definition;
 original:='IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=grant_row.tenant_id AND instance_id=grant_row.instance_id AND status NOT IN (''succeeded'',''failed'')) THEN';
 replacement:='IF lzc_auth.application_execution_blocked(p_job,grant_row.instance_id,grant_row.tenant_id,(SELECT coalesce(inputs->>''purpose'',''standard'') FROM lzc.application_jobs WHERE id=p_job)) THEN';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'application maintenance delegation source mismatch'; END IF;
 EXECUTE replace(definition,original,replacement);

 SELECT pg_get_functiondef('lzc_auth.reserve_application_dispatch(uuid,uuid)'::regprocedure) INTO definition;
 original:='IF EXISTS(SELECT 1 FROM lzc.application_dispatches WHERE tenant_id=g.tenant_id AND instance_id=g.instance_id AND status NOT IN (''succeeded'',''failed'')) THEN';
 replacement:='IF lzc_auth.application_execution_blocked(p_job,g.instance_id,g.tenant_id,(SELECT coalesce(inputs->>''purpose'',''standard'') FROM lzc.application_jobs WHERE id=p_job)) THEN';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'application maintenance reservation source mismatch'; END IF;
 EXECUTE replace(definition,original,replacement);

 FOREACH signature IN ARRAY ARRAY['lzc_auth.application_apply_plan(uuid,uuid,text)','lzc_auth.application_running_apply_plan(uuid,uuid,text,uuid)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  original:='PERFORM lzc_auth.assert_application_job_group(p_plan);';
  replacement:='IF planned.inputs->>''purpose''=''drift'' THEN RAISE EXCEPTION ''application_drift_read_only'' USING ERRCODE=''40001''; END IF; PERFORM lzc_auth.assert_application_job_group(p_plan);';
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'application maintenance saved plan source mismatch'; END IF;
  definition:=replace(definition,original,replacement);
  original:='OR artifact.summary->>''completeness'' IS DISTINCT FROM ''complete''';
  replacement:='OR (planned.inputs->>''purpose''=''destroy'' AND (artifact.summary->''resources''->>''create''<>''0'' OR artifact.summary->''resources''->>''update''<>''0'' OR artifact.summary->''resources''->>''replace''<>''0'')) OR artifact.summary->>''completeness'' IS DISTINCT FROM ''complete''';
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'application maintenance summary source mismatch'; END IF;
  EXECUTE replace(definition,original,replacement);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION lzc.application_order_archivable(p_instance uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=p_instance AND i.tenant_id=lzc.current_tenant_id()
  AND (i.requested_by=lzc.current_user_id() OR lzc.application_role('platform-engineer'))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions deleted WHERE deleted.instance_id=i.id)
  AND EXISTS(SELECT 1 FROM lzc.application_jobs job JOIN lzc.application_dispatches completed ON completed.job_id=job.id
   WHERE job.instance_id=i.id AND job.operation='apply' AND completed.finished_at IS NOT NULL
    AND (completed.status IN ('failed','reconciliation_required') OR (completed.status='succeeded' AND job.inputs->>'purpose'='destroy'))
    AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs newer WHERE newer.instance_id=i.id AND newer.operation='apply' AND (newer.created_at,newer.id)>(job.created_at,job.id)))
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs job WHERE job.instance_id=i.id
   AND (job.operation='apply' OR EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=job.id)
    OR EXISTS(SELECT 1 FROM lzc.application_job_claims c WHERE c.job_id=job.id)
    OR EXISTS(SELECT 1 FROM lzc.application_runner_tickets t WHERE t.job_id=job.id))
   AND NOT EXISTS(SELECT 1 FROM lzc.application_dispatches d WHERE d.job_id=job.id AND d.finished_at IS NOT NULL AND d.status IN ('succeeded','failed','reconciliation_required')))
 );
$$;

CREATE OR REPLACE FUNCTION lzc_auth.application_apply_available(p_session uuid,p_plan uuid,p_sha text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; purpose text;
BEGIN
 context:=lzc_auth.application_apply_plan(p_session,p_plan,p_sha);
 SELECT coalesce(inputs->>'purpose','standard') INTO purpose FROM lzc.application_jobs WHERE id=p_plan;
 RETURN (context->>'finishedAt')::timestamptz+interval '1 hour'>now()
  AND NOT EXISTS(SELECT 1 FROM lzc.application_jobs WHERE plan_id=p_plan AND operation='apply')
  AND NOT lzc_auth.application_execution_blocked(p_plan,(context->>'instanceId')::uuid,lzc.current_tenant_id(),purpose);
EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION lzc.validate_application_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; planned lzc.application_jobs; purpose text;
BEGIN
 purpose:=coalesce(NEW.inputs->>'purpose','standard');
 IF lzc_auth.application_execution_blocked(NEW.id,NEW.instance_id,NEW.tenant_id,purpose,NEW.operation='plan') THEN
  RAISE EXCEPTION 'application_instance_running' USING ERRCODE='40001';
 END IF;
 IF NEW.operation='plan' THEN
  PERFORM lzc_auth.require_active_application_order(NEW.issuer_session_id,NEW.instance_id);
  RETURN NEW;
 END IF;
 IF purpose='drift' THEN RAISE EXCEPTION 'application_drift_read_only' USING ERRCODE='40001'; END IF;
 context:=lzc_auth.application_apply_plan(NEW.issuer_session_id,NEW.plan_id,NEW.artifact_sha256);
 SELECT * INTO planned FROM lzc.application_jobs WHERE id=NEW.plan_id;
 IF NEW.instance_id<>planned.instance_id OR NEW.owner_user_id<>planned.owner_user_id OR NEW.tenant_id<>planned.tenant_id
  OR NEW.inputs IS DISTINCT FROM planned.inputs OR NEW.binding_sha256<>planned.binding_sha256
  OR (context->>'finishedAt')::timestamptz+interval '1 hour'<=now()
  OR EXISTS(SELECT 1 FROM lzc.application_jobs j WHERE j.plan_id=NEW.plan_id AND j.operation='apply') THEN
  RAISE EXCEPTION 'application_apply_plan_unavailable' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;