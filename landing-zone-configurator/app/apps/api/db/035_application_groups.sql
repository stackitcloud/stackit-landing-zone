CREATE TABLE lzc.application_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80 AND name=btrim(name)),
 is_default boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE UNIQUE INDEX application_default_group ON lzc.application_groups(tenant_id) WHERE is_default;

CREATE TABLE lzc.application_group_members (
 tenant_id uuid NOT NULL,
 group_id uuid NOT NULL,
 user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,group_id,user_id),
 FOREIGN KEY(tenant_id,group_id) REFERENCES lzc.application_groups(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES lzc.memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE lzc.application_template_groups (
 tenant_id uuid NOT NULL,
 version_id uuid NOT NULL,
 group_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,version_id,group_id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES lzc.application_template_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,group_id) REFERENCES lzc.application_groups(tenant_id,id)
);

ALTER TABLE lzc.application_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lzc.application_template_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY application_group_migration ON lzc.application_groups TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_group_member_migration ON lzc.application_group_members TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_template_group_migration ON lzc.application_template_groups TO configurator_migration USING(true) WITH CHECK(true);
CREATE POLICY application_group_member_read ON lzc.application_group_members FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (user_id=lzc.current_user_id() OR lzc.application_role('platform-engineer')));
CREATE POLICY application_group_read ON lzc.application_groups FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR EXISTS(
  SELECT 1 FROM lzc.application_group_members member WHERE member.tenant_id=application_groups.tenant_id AND member.group_id=application_groups.id AND member.user_id=lzc.current_user_id()
 )));
CREATE POLICY application_template_group_read ON lzc.application_template_groups FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR EXISTS(
  SELECT 1 FROM lzc.application_group_members member WHERE member.tenant_id=application_template_groups.tenant_id AND member.group_id=application_template_groups.group_id AND member.user_id=lzc.current_user_id()
 )));
GRANT SELECT ON lzc.application_groups,lzc.application_group_members,lzc.application_template_groups TO configurator_app;

INSERT INTO lzc.application_groups(tenant_id,name,is_default) SELECT id,'Application Owners',true FROM lzc.tenants;
INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id)
 SELECT membership.tenant_id,groups.id,membership.user_id FROM lzc.memberships membership
 JOIN lzc.tenants tenant ON tenant.id=membership.tenant_id
 JOIN lzc.application_groups groups ON groups.tenant_id=tenant.id AND groups.is_default
 WHERE 'application-owner'=ANY(membership.product_roles) OR (tenant.kind='personal' AND tenant.owner_user_id=membership.user_id AND membership.role='admin');
INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id)
 SELECT version.tenant_id,version.id,groups.id FROM lzc.application_template_versions version
 JOIN lzc.application_groups groups ON groups.tenant_id=version.tenant_id AND groups.is_default;

CREATE FUNCTION lzc.create_default_application_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO lzc.application_groups(tenant_id,name,is_default) VALUES(NEW.id,'Application Owners',true);
 RETURN NEW;
END $$;
CREATE TRIGGER create_default_application_group AFTER INSERT ON lzc.tenants FOR EACH ROW EXECUTE FUNCTION lzc.create_default_application_group();

CREATE FUNCTION lzc.sync_default_application_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF 'application-owner'=ANY(NEW.product_roles) OR EXISTS(
  SELECT 1 FROM lzc.tenants tenant WHERE tenant.id=NEW.tenant_id AND tenant.kind='personal' AND tenant.owner_user_id=NEW.user_id AND NEW.role='admin'
 ) THEN
  INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id)
   SELECT NEW.tenant_id,groups.id,NEW.user_id FROM lzc.application_groups groups WHERE groups.tenant_id=NEW.tenant_id AND groups.is_default
   ON CONFLICT DO NOTHING;
 ELSE
  DELETE FROM lzc.application_group_members WHERE tenant_id=NEW.tenant_id AND user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_default_application_membership AFTER INSERT OR UPDATE ON lzc.memberships FOR EACH ROW EXECUTE FUNCTION lzc.sync_default_application_membership();

CREATE FUNCTION lzc.default_application_template_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id)
  SELECT NEW.tenant_id,NEW.id,groups.id FROM lzc.application_groups groups WHERE groups.tenant_id=NEW.tenant_id AND groups.is_default;
 RETURN NEW;
END $$;
CREATE TRIGGER default_application_template_access AFTER INSERT ON lzc.application_template_versions FOR EACH ROW EXECUTE FUNCTION lzc.default_application_template_access();

CREATE FUNCTION lzc_auth.application_template_group_access(p_tenant uuid,p_user uuid,p_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM lzc.memberships membership JOIN lzc.tenants tenant ON tenant.id=membership.tenant_id
  JOIN lzc.application_template_versions version ON version.tenant_id=tenant.id AND version.id=p_version
  WHERE tenant.id=p_tenant AND tenant.archived_at IS NULL AND membership.user_id=p_user AND (
   'platform-engineer'=ANY(membership.product_roles) OR
   (tenant.kind='personal' AND tenant.owner_user_id=p_user AND membership.role='admin') OR
   ('application-owner'=ANY(membership.product_roles) AND EXISTS(
    SELECT 1 FROM lzc.application_template_groups access JOIN lzc.application_group_members member
     ON member.tenant_id=access.tenant_id AND member.group_id=access.group_id
    WHERE access.tenant_id=p_tenant AND access.version_id=p_version AND member.user_id=p_user
   ))
  )
 )
$$;
CREATE FUNCTION lzc.application_template_access(p_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.application_template_group_access(lzc.current_tenant_id(),lzc.current_user_id(),p_version)
$$;
REVOKE ALL ON FUNCTION lzc_auth.application_template_group_access(uuid,uuid,uuid),lzc.create_default_application_group(),lzc.sync_default_application_membership(),lzc.default_application_template_access(),lzc.application_template_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc.application_template_access(uuid) TO configurator_app;

DROP POLICY application_version_read ON lzc.application_template_versions;
CREATE POLICY application_version_read ON lzc.application_template_versions FOR SELECT TO configurator_app
 USING(tenant_id=lzc.current_tenant_id() AND (lzc.application_role('platform-engineer') OR lzc.application_template_access(id)));
DROP POLICY application_instance_insert ON lzc.application_instances;
CREATE POLICY application_instance_insert ON lzc.application_instances FOR INSERT TO configurator_app
 WITH CHECK(tenant_id=lzc.current_tenant_id() AND requested_by=lzc.current_user_id() AND lzc.application_template_access(version_id));

CREATE FUNCTION lzc_auth.manage_application_groups(p_session uuid,p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,p_tenant,'publish');
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 IF NOT EXISTS(
  SELECT 1 FROM lzc.memberships membership JOIN lzc.tenants tenant ON tenant.id=membership.tenant_id
  WHERE tenant.id=p_tenant AND membership.user_id=actor AND (membership.manage_members OR (tenant.kind='personal' AND tenant.owner_user_id=actor AND membership.role='admin'))
 ) THEN RAISE EXCEPTION 'application_group_management_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM lzc.tenants WHERE id=p_tenant FOR UPDATE;
END $$;

CREATE FUNCTION lzc_auth.create_application_group(p_session uuid,p_tenant uuid,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE created uuid; actor uuid;
BEGIN
 PERFORM lzc_auth.manage_application_groups(p_session,p_tenant);
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 INSERT INTO lzc.application_groups(tenant_id,name) VALUES(p_tenant,p_name) RETURNING id INTO created;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,actor,'application_group_created',jsonb_build_object('groupId',created));
 RETURN created;
END $$;

CREATE FUNCTION lzc_auth.set_application_group_members(p_session uuid,p_tenant uuid,p_group uuid,p_users uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM lzc_auth.manage_application_groups(p_session,p_tenant);
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 PERFORM 1 FROM lzc.application_groups WHERE id=p_group AND tenant_id=p_tenant AND NOT is_default FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_group_not_editable' USING ERRCODE='42501'; END IF;
 IF cardinality(p_users)>200 OR EXISTS(
  SELECT 1 FROM unnest(p_users) requested(user_id) WHERE NOT EXISTS(
   SELECT 1 FROM lzc.memberships membership WHERE membership.tenant_id=p_tenant AND membership.user_id=requested.user_id AND 'application-owner'=ANY(membership.product_roles)
  )
 ) THEN RAISE EXCEPTION 'application_group_member_invalid' USING ERRCODE='42501'; END IF;
 DELETE FROM lzc.application_group_members WHERE tenant_id=p_tenant AND group_id=p_group;
 INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id) SELECT p_tenant,p_group,user_id FROM unnest(p_users) requested(user_id) ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,actor,'application_group_members_changed',jsonb_build_object('groupId',p_group,'userIds',p_users));
END $$;

CREATE FUNCTION lzc_auth.set_application_template_groups(p_session uuid,p_tenant uuid,p_version uuid,p_groups uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,p_tenant,'publish');
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 PERFORM 1 FROM lzc.application_template_versions WHERE id=p_version AND tenant_id=p_tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'template_version_not_found' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-access:' || p_tenant::text || ':' || p_version::text,0));
 IF cardinality(p_groups)>100 OR EXISTS(SELECT 1 FROM unnest(p_groups) requested(group_id) WHERE NOT EXISTS(SELECT 1 FROM lzc.application_groups WHERE tenant_id=p_tenant AND id=requested.group_id)) THEN
  RAISE EXCEPTION 'application_template_group_invalid' USING ERRCODE='42501';
 END IF;
 DELETE FROM lzc.application_template_groups WHERE tenant_id=p_tenant AND version_id=p_version;
 INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id) SELECT p_tenant,p_version,group_id FROM unnest(p_groups) requested(group_id) ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,actor,'application_template_groups_changed',jsonb_build_object('versionId',p_version,'groupIds',p_groups));
END $$;

CREATE FUNCTION lzc_auth.assert_application_job_group(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job lzc.application_jobs; instance lzc.application_instances;
BEGIN
 SELECT * INTO STRICT job FROM lzc.application_jobs WHERE id=p_job;
 SELECT * INTO STRICT instance FROM lzc.application_instances WHERE id=job.instance_id;
 PERFORM 1 FROM lzc.application_template_groups permission
 JOIN lzc.application_group_members member ON member.tenant_id=permission.tenant_id AND member.group_id=permission.group_id
 WHERE permission.tenant_id=job.tenant_id AND permission.version_id=instance.version_id AND member.user_id=job.owner_user_id
 FOR SHARE OF permission,member;
 IF job.tenant_id IS DISTINCT FROM lzc.current_tenant_id() OR NOT (
  job.owner_user_id=lzc.current_user_id() OR lzc.application_role('platform-engineer')
 ) OR NOT lzc_auth.application_template_group_access(job.tenant_id,job.owner_user_id,instance.version_id) THEN
  RAISE EXCEPTION 'application_template_access_denied' USING ERRCODE='42501';
 END IF;
END $$;
CREATE FUNCTION lzc.guard_application_job_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE instance lzc.application_instances;
BEGIN
 SELECT * INTO STRICT instance FROM lzc.application_instances WHERE id=NEW.instance_id AND tenant_id=NEW.tenant_id;
 IF NOT lzc_auth.application_template_group_access(NEW.tenant_id,NEW.owner_user_id,instance.version_id) THEN
  RAISE EXCEPTION 'application_template_access_denied' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_application_job_group BEFORE INSERT ON lzc.application_jobs FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_job_group();
REVOKE ALL ON FUNCTION lzc_auth.manage_application_groups(uuid,uuid),lzc_auth.create_application_group(uuid,uuid,text),lzc_auth.set_application_group_members(uuid,uuid,uuid,uuid[]),lzc_auth.set_application_template_groups(uuid,uuid,uuid,uuid[]),lzc_auth.assert_application_job_group(uuid),lzc.guard_application_job_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.create_application_group(uuid,uuid,text),lzc_auth.set_application_group_members(uuid,uuid,uuid,uuid[]),lzc_auth.set_application_template_groups(uuid,uuid,uuid,uuid[]),lzc_auth.assert_application_job_group(uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.approve_application_job_backend(p_session uuid,p_job uuid,p_backend uuid)
RETURNS lzc.application_job_backends LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g lzc.application_job_grants; j lzc.application_jobs; approved lzc.application_job_backends; descriptor jsonb; approval_expiry timestamptz;
BEGIN
 PERFORM lzc_auth.authorize_application(p_session,lzc.current_tenant_id(),'publish');
 PERFORM lzc_auth.assert_application_job_group(p_job);
 SELECT * INTO g FROM lzc.application_job_grants WHERE job_id=p_job AND tenant_id=lzc.current_tenant_id() AND approved_by=lzc.current_user_id() FOR UPDATE;
 IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at<=now() THEN
  RAISE EXCEPTION 'application_job_grant_unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO j FROM lzc.application_jobs WHERE id=p_job AND tenant_id=g.tenant_id AND owner_user_id=g.owner_user_id;
 IF NOT FOUND OR j.status<>'prepared' OR NOT EXISTS(
  SELECT 1 FROM lzc_auth.sessions s JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=g.tenant_id
  JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
  WHERE s.id=j.issuer_session_id AND s.user_id=g.owner_user_id AND s.expires_at>now()
   AND coalesce(s.active_tenant_id,s.tenant_id)=g.tenant_id
   AND ('platform-engineer'=ANY(m.product_roles) OR 'application-owner'=ANY(m.product_roles))
 ) OR NOT EXISTS(
  SELECT 1 FROM lzc.stackit_identities human WHERE human.user_id=g.approved_by AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now()
 ) OR NOT EXISTS(
  SELECT 1 FROM lzc.stackit_identities human JOIN lzc.application_instances i ON i.requested_by=human.user_id AND i.id=g.instance_id AND i.tenant_id=g.tenant_id
  WHERE human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now() AND human.email=i.resolved_settings->>'owner_email'
 ) THEN RAISE EXCEPTION 'application_job_authority_unavailable' USING ERRCODE='42501'; END IF;
 SELECT b.descriptor INTO descriptor FROM lzc.state_backends b WHERE b.id=p_backend AND b.tenant_id=g.tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_backend_not_found' USING ERRCODE='42501'; END IF;
 SELECT least(g.expires_at,s.expires_at,human.valid_until) INTO approval_expiry
 FROM lzc_auth.sessions s JOIN lzc.stackit_identities human ON human.user_id=s.user_id
 WHERE s.id=p_session AND s.user_id=g.approved_by AND s.expires_at>now()
  AND human.issuer='https://accounts.stackit.cloud' AND human.revoked_at IS NULL AND human.valid_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'application_backend_approver_expired' USING ERRCODE='42501'; END IF;
 SELECT * INTO approved FROM lzc.application_job_backends WHERE job_id=p_job;
 IF FOUND THEN
  IF approved.expires_at<=now() OR NOT EXISTS(
   SELECT 1 FROM lzc_auth.sessions s WHERE s.id=approved.approval_session_id AND s.user_id=g.approved_by AND s.expires_at>now() AND coalesce(s.active_tenant_id,s.tenant_id)=g.tenant_id
  ) THEN RAISE EXCEPTION 'application_backend_approval_expired' USING ERRCODE='42501'; END IF;
  IF approved.backend_id IS DISTINCT FROM p_backend THEN RAISE EXCEPTION 'application_backend_binding_conflict' USING ERRCODE='40001'; END IF;
  RETURN approved;
 END IF;
 INSERT INTO lzc.application_job_backends(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,backend_id,descriptor,expires_at)
 VALUES(g.job_id,g.tenant_id,g.owner_user_id,g.approved_by,p_session,p_backend,descriptor || jsonb_build_object('key',g.state_key,'useLockfile',true),approval_expiry)
 RETURNING * INTO approved;
 RETURN approved;
END $$;

CREATE FUNCTION lzc.guard_application_ticket_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.assert_application_job_group(NEW.job_id);
 RETURN NEW;
END $$;
CREATE TRIGGER verify_application_ticket_group BEFORE INSERT OR UPDATE ON lzc.application_runner_tickets FOR EACH ROW EXECUTE FUNCTION lzc.guard_application_ticket_group();
REVOKE ALL ON FUNCTION lzc.guard_application_ticket_group() FROM PUBLIC;

CREATE OR REPLACE FUNCTION lzc_auth.resolve_application_runner_ticket(p_hash text,p_package uuid,p_source text,p_lock text)
RETURNS TABLE(job_id uuid,session_id uuid,user_id uuid,tenant_id uuid,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT ticket.job_id,s.id,s.user_id,ticket.tenant_id,least(s.expires_at,ticket.expires_at)
 FROM lzc.application_runner_tickets ticket JOIN lzc_auth.sessions s ON s.id=ticket.approval_session_id
 JOIN lzc.memberships m ON m.user_id=s.user_id AND m.tenant_id=ticket.tenant_id
 JOIN lzc.tenants t ON t.id=m.tenant_id AND t.archived_at IS NULL AND t.organization_verified
 JOIN lzc.application_jobs job ON job.id=ticket.job_id AND job.tenant_id=ticket.tenant_id
 JOIN lzc.application_instances instance ON instance.id=job.instance_id AND instance.tenant_id=job.tenant_id
 WHERE ticket.ticket_hash=p_hash AND ticket.runner_package_id=p_package AND ticket.accelerator_revision=p_source AND ticket.provider_lock_sha256=p_lock
  AND ticket.expires_at>now() AND ticket.consumed_at IS NULL AND s.expires_at>now()
  AND coalesce(s.active_tenant_id,s.tenant_id)=ticket.tenant_id AND 'platform-engineer'=ANY(m.product_roles)
  AND lzc_auth.application_template_group_access(job.tenant_id,job.owner_user_id,instance.version_id);
$$;