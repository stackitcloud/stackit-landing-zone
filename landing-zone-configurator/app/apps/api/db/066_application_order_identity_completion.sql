-- Complete an order created before its owner's first valid human proof. Never
-- rebind a known identity or change approved/executed order evidence.
CREATE TABLE lzc.application_order_identity_completions (
 instance_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 completed_by uuid NOT NULL REFERENCES lzc_auth.users(id),
 issuer text NOT NULL,
 subject text NOT NULL,
 email text NOT NULL,
 initial_settings jsonb NOT NULL,
 completed_settings jsonb NOT NULL,
 initial_blockers jsonb NOT NULL,
 completed_blockers jsonb NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES lzc.application_instances(tenant_id,id)
);
ALTER TABLE lzc.application_order_identity_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_order_identity_completions FORCE ROW LEVEL SECURITY;
CREATE POLICY application_identity_completion_read ON lzc.application_order_identity_completions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND ((completed_by=lzc.current_user_id() AND lzc.application_role('application-owner')) OR lzc.application_role('platform-engineer')));
CREATE POLICY application_identity_completion_migration ON lzc.application_order_identity_completions TO configurator_migration USING(true) WITH CHECK(true);
GRANT SELECT ON lzc.application_order_identity_completions TO configurator_app;
CREATE TRIGGER immutable_application_identity_completion BEFORE UPDATE OR DELETE ON lzc.application_order_identity_completions
 FOR EACH ROW EXECUTE FUNCTION lzc.immutable_application_version();

CREATE FUNCTION lzc_auth.complete_application_order_identity(p_session uuid,p_instance uuid,p_settings jsonb)
RETURNS lzc.application_instances LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ordered lzc.application_instances; human lzc.stackit_identities; published lzc.application_template_versions;
 expected_settings jsonb; expected_roles jsonb; added_roles jsonb; role_policy jsonb; blockers jsonb;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'order');
 -- Decision/deletion operations take this same row lock. Existing jobs are an
 -- absolute boundary; their inputs, grants, artifacts and State never get rebound.
 SELECT * INTO ordered FROM lzc.application_instances
  WHERE id=p_instance AND tenant_id=lzc.current_tenant_id() AND requested_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM lzc.application_order_deletions WHERE instance_id=p_instance) THEN
  RAISE EXCEPTION 'application_identity_completion_access_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO human FROM lzc.stackit_identities
  WHERE user_id=ordered.requested_by AND issuer='https://accounts.stackit.cloud' AND revoked_at IS NULL AND valid_until>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_identity_completion_access_denied' USING ERRCODE='42501'; END IF;
 IF ordered.resolved_settings->>'owner_email' IS NOT NULL THEN
  IF ordered.resolved_settings->>'owner_email' IS DISTINCT FROM human.email THEN
   RAISE EXCEPTION 'application_owner_identity_changed' USING ERRCODE='40001';
  END IF;
  RETURN ordered;
 END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_jobs WHERE instance_id=p_instance) OR
  EXISTS(SELECT 1 FROM lzc.application_order_decisions WHERE instance_id=p_instance) OR
  EXISTS(SELECT 1 FROM lzc.application_order_identity_completions WHERE instance_id=p_instance) THEN
  RAISE EXCEPTION 'application_order_identity_completion_unavailable' USING ERRCODE='40001';
 END IF;
 SELECT * INTO published FROM lzc.application_template_versions WHERE id=ordered.version_id AND tenant_id=ordered.tenant_id;
 IF NOT FOUND OR NOT lzc.application_template_access(ordered.version_id) THEN RAISE EXCEPTION 'application_identity_completion_access_denied' USING ERRCODE='42501'; END IF;
 expected_settings:=ordered.resolved_settings || jsonb_build_object('owner_email',human.email);
 role_policy:=published.document#>'{parameterPolicy,fields,role_assignments}';
 IF role_policy->>'source'='context' AND role_policy->>'variable'='verified-project-owner' THEN
  expected_roles:=coalesce(ordered.resolved_settings->'role_assignments','[]'::jsonb);
  SELECT coalesce(jsonb_agg(jsonb_build_object('role',role.value,'subject',human.email) ORDER BY role.position),'[]'::jsonb)
   INTO added_roles FROM jsonb_array_elements_text(role_policy->'roles') WITH ORDINALITY AS role(value,position)
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected_roles) assignment WHERE assignment->>'role'=role.value AND assignment->>'subject'=human.email);
  expected_settings:=jsonb_set(expected_settings,'{role_assignments}',expected_roles || added_roles);
 END IF;
 -- The normal domain resolver supplies the candidate. SQL independently limits
 -- completion to this verified email and the template's declared context roles.
 IF p_settings IS DISTINCT FROM expected_settings THEN
  RAISE EXCEPTION 'application_identity_completion_access_denied' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(item.value ORDER BY item.position),'[]'::jsonb) INTO blockers
  FROM jsonb_array_elements(ordered.qualification_blockers) WITH ORDINALITY item(value,position)
  WHERE item.value NOT IN (
   '"Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt."'::jsonb,
   '"Die STACKIT-Identität der projektverantwortlichen Person wird erst bei der Instanziierung verifiziert."'::jsonb
  );
 INSERT INTO lzc.application_order_identity_completions(instance_id,tenant_id,completed_by,issuer,subject,email,initial_settings,completed_settings,initial_blockers,completed_blockers)
 VALUES(ordered.id,ordered.tenant_id,ordered.requested_by,human.issuer,human.subject,human.email,ordered.resolved_settings,expected_settings,ordered.qualification_blockers,blockers);
 UPDATE lzc.application_instances SET resolved_settings=expected_settings,qualification_blockers=blockers
  WHERE id=ordered.id AND tenant_id=ordered.tenant_id RETURNING * INTO ordered;
 RETURN ordered;
END $$;
REVOKE ALL ON FUNCTION lzc_auth.complete_application_order_identity(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.complete_application_order_identity(uuid,uuid,jsonb) TO configurator_app;
