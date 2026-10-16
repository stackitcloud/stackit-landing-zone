CREATE FUNCTION lzc_auth.delete_application_group(p_session uuid,p_tenant uuid,p_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM lzc_auth.manage_application_groups(p_session,p_tenant);
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 PERFORM 1 FROM lzc.application_groups WHERE id=p_group AND tenant_id=p_tenant AND NOT is_default FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_group_not_editable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM lzc.application_template_groups WHERE tenant_id=p_tenant AND group_id=p_group) THEN
  RAISE EXCEPTION 'application_group_in_use' USING ERRCODE='55000';
 END IF;
 DELETE FROM lzc.application_group_members WHERE tenant_id=p_tenant AND group_id=p_group;
 DELETE FROM lzc.application_groups WHERE tenant_id=p_tenant AND id=p_group;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,actor,'application_group_deleted',jsonb_build_object('groupId',p_group));
END $$;
REVOKE ALL ON FUNCTION lzc_auth.delete_application_group(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.delete_application_group(uuid,uuid,uuid) TO configurator_app;

CREATE OR REPLACE FUNCTION lzc_auth.set_application_group_members(p_session uuid,p_tenant uuid,p_group uuid,p_users uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM lzc_auth.manage_application_groups(p_session,p_tenant);
 SELECT user_id INTO STRICT actor FROM lzc_auth.sessions WHERE id=p_session;
 PERFORM 1 FROM lzc.application_groups WHERE id=p_group AND tenant_id=p_tenant AND NOT is_default FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'application_group_not_editable' USING ERRCODE='42501'; END IF;
 IF cardinality(p_users)>200 OR EXISTS(
  SELECT 1 FROM unnest(p_users) requested(user_id) WHERE NOT EXISTS(
   SELECT 1 FROM lzc.memberships membership WHERE membership.tenant_id=p_tenant AND membership.user_id=requested.user_id
  )
 ) THEN RAISE EXCEPTION 'application_group_member_invalid' USING ERRCODE='42501'; END IF;
 DELETE FROM lzc.application_group_members WHERE tenant_id=p_tenant AND group_id=p_group;
 INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id) SELECT p_tenant,p_group,user_id FROM unnest(p_users) requested(user_id) ON CONFLICT DO NOTHING;
 INSERT INTO lzc_auth.membership_audit(tenant_id,actor_id,action,details) VALUES(p_tenant,actor,'application_group_members_changed',jsonb_build_object('groupId',p_group,'userIds',p_users));
END $$;

CREATE OR REPLACE FUNCTION lzc.sync_default_application_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF 'application-owner'=ANY(NEW.product_roles) OR EXISTS(
    SELECT 1 FROM lzc.tenants tenant WHERE tenant.id=NEW.tenant_id AND tenant.kind='personal' AND tenant.owner_user_id=NEW.user_id AND NEW.role='admin'
 ) THEN
    INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id)
     SELECT NEW.tenant_id,groups.id,NEW.user_id FROM lzc.application_groups groups WHERE groups.tenant_id=NEW.tenant_id AND groups.is_default
     ON CONFLICT DO NOTHING;
 ELSE
    DELETE FROM lzc.application_group_members member USING lzc.application_groups groups
     WHERE member.tenant_id=NEW.tenant_id AND member.user_id=NEW.user_id
        AND groups.tenant_id=member.tenant_id AND groups.id=member.group_id AND groups.is_default;
 END IF;
 RETURN NEW;
END $$;