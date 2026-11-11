-- Transactional, metadata-only inbox/outbox. Runtime never has direct table access.
CREATE TABLE lzc_auth.notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES lzc_auth.users(id),
 locale text NOT NULL DEFAULT 'de' CHECK(locale IN ('de','en')),
 email_topics text[] NOT NULL DEFAULT ARRAY['approvals','execution-failure','recovery','access','reminders']::text[]
  CHECK(email_topics <@ ARRAY['approvals','execution-success','execution-failure','recovery','access','reminders']::text[])
);
CREATE TABLE lzc_auth.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES lzc.tenants(id),
 user_id uuid NOT NULL REFERENCES lzc_auth.users(id), event_key text NOT NULL CHECK(length(event_key)<=220),
 topic text NOT NULL CHECK(topic IN ('invitations','approvals','execution-success','execution-failure','recovery','access','reminders')),
 kind text NOT NULL CHECK(kind IN ('invitation','invitation-expiring','order-pending','order-approved','order-rejected','execution-succeeded','execution-failed','execution-cancelled','recovery-required','access-changed','action-overdue','upgrade-approved')),
 resource_type text NOT NULL CHECK(resource_type IN ('invitation','application','platform','workspace')),
 resource_id uuid NOT NULL, operation text CHECK(operation IN ('plan','apply')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
 email_status text NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sending','accepted','suppressed','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 claim_id uuid, claimed_at timestamptz, last_error text CHECK(last_error IN ('temporary','rejected','ambiguous','authorization','preference','expired','no-address')),
 accepted_at timestamptz, invitation_cipher bytea, invitation_email text, invitation_locale text CHECK(invitation_locale IN ('de','en')),
 UNIQUE(user_id,event_key), CHECK((invitation_cipher IS NULL)=(invitation_email IS NULL)),
 CHECK(invitation_cipher IS NULL OR (kind='invitation' AND octet_length(invitation_cipher) BETWEEN 29 AND 2048))
);
CREATE INDEX notification_inbox ON lzc_auth.notifications(tenant_id,user_id,created_at DESC);
CREATE INDEX notification_pending ON lzc_auth.notifications(next_attempt_at) WHERE email_status='pending';
REVOKE ALL ON lzc_auth.notifications,lzc_auth.notification_preferences FROM PUBLIC,configurator_app;
ALTER TABLE lzc_auth.invitations ADD COLUMN recipient_email text CHECK(length(recipient_email) BETWEEN 3 AND 254);

CREATE FUNCTION lzc_auth.notification_session(p_session uuid,p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s lzc_auth.sessions;
BEGIN
 SELECT * INTO STRICT s FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 IF coalesce(s.active_tenant_id,s.tenant_id)<>p_tenant OR NOT EXISTS(SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id WHERE m.tenant_id=p_tenant AND m.user_id=s.user_id AND t.archived_at IS NULL) THEN
 RAISE EXCEPTION 'notification_access_denied' USING ERRCODE='42501'; END IF;
 RETURN s.user_id;
END $$;
CREATE FUNCTION lzc_auth.notification_visible(n lzc_auth.notifications) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM lzc.memberships m JOIN lzc.tenants t ON t.id=m.tenant_id
  WHERE m.tenant_id=n.tenant_id AND m.user_id=n.user_id AND t.archived_at IS NULL AND
  CASE n.resource_type
   WHEN 'platform' THEN (t.kind='personal' OR 'platform-engineer'=ANY(m.product_roles)) AND EXISTS(SELECT 1 FROM lzc.plan_runs r WHERE r.id=n.resource_id AND r.tenant_id=n.tenant_id AND r.owner_user_id=n.user_id)
   WHEN 'application' THEN EXISTS(SELECT 1 FROM lzc.application_instances i WHERE i.id=n.resource_id AND i.tenant_id=n.tenant_id AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions archived WHERE archived.instance_id=i.id) AND ('platform-engineer'=ANY(m.product_roles) OR (i.requested_by=n.user_id AND 'application-owner'=ANY(m.product_roles))))
   WHEN 'invitation' THEN m.manage_members AND EXISTS(SELECT 1 FROM lzc_auth.invitations i WHERE i.id=n.resource_id AND i.tenant_id=n.tenant_id AND i.created_by=n.user_id AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>now())
   WHEN 'workspace' THEN m.manage_members
   ELSE false END)
$$;
CREATE FUNCTION lzc_auth.notification_list(p_session uuid,p_tenant uuid,p_before timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 u:=lzc_auth.notification_session(p_session,p_tenant);
 RETURN jsonb_build_object('unread',(SELECT count(*) FROM lzc_auth.notifications n WHERE n.tenant_id=p_tenant AND n.user_id=u AND n.read_at IS NULL AND n.created_at>now()-interval '90 days' AND n.kind<>'invitation' AND lzc_auth.notification_visible(n)),
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'topic',n.topic,'kind',n.kind,'resourceType',n.resource_type,'resourceId',n.resource_id,'operation',n.operation,'createdAt',n.created_at,'readAt',n.read_at,'emailStatus',n.email_status) ORDER BY n.created_at DESC),'[]'::jsonb)
 FROM (SELECT * FROM lzc_auth.notifications candidate WHERE candidate.tenant_id=p_tenant AND candidate.user_id=u AND candidate.kind<>'invitation' AND candidate.created_at>now()-interval '90 days' AND (p_before IS NULL OR candidate.created_at<p_before) AND lzc_auth.notification_visible(candidate) ORDER BY candidate.created_at DESC LIMIT 50) n));
END $$;
CREATE FUNCTION lzc_auth.notification_read(p_session uuid,p_tenant uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 u:=lzc_auth.notification_session(p_session,p_tenant);
 UPDATE lzc_auth.notifications n SET read_at=coalesce(read_at,now()) WHERE n.tenant_id=p_tenant AND n.user_id=u AND (p_id IS NULL OR n.id=p_id) AND lzc_auth.notification_visible(n);
END $$;
CREATE FUNCTION lzc_auth.notification_preferences(p_session uuid,p_tenant uuid,p_locale text DEFAULT NULL,p_topics text[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; p lzc_auth.notification_preferences;
BEGIN
 u:=lzc_auth.notification_session(p_session,p_tenant);
 INSERT INTO lzc_auth.notification_preferences(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 IF p_locale IS NOT NULL AND p_topics IS NOT NULL THEN UPDATE lzc_auth.notification_preferences SET locale=p_locale,email_topics=p_topics WHERE user_id=u; END IF;
 SELECT * INTO STRICT p FROM lzc_auth.notification_preferences WHERE user_id=u;
 RETURN jsonb_build_object('locale',p.locale,'emailTopics',p.email_topics,'hasVerifiedEmail',EXISTS(SELECT 1 FROM lzc.stackit_identities h WHERE h.user_id=u AND h.revoked_at IS NULL));
END $$;
CREATE FUNCTION lzc_auth.enqueue_notification(p_tenant uuid,p_user uuid,p_key text,p_topic text,p_kind text,p_type text,p_resource uuid,p_operation text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO lzc_auth.notifications(tenant_id,user_id,event_key,topic,kind,resource_type,resource_id,operation)
 VALUES(p_tenant,p_user,p_key,p_topic,p_kind,p_type,p_resource,p_operation) ON CONFLICT(user_id,event_key) DO NOTHING
$$;
CREATE FUNCTION lzc_auth.notification_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE recipient record; owner_id uuid; resource uuid; kind text; topic text; operation text; key text;
BEGIN
 IF TG_TABLE_NAME='plan_runs' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('succeeded','failed','cancelled','recovery_required') THEN RETURN NEW; END IF;
  kind:=CASE NEW.status WHEN 'succeeded' THEN 'execution-succeeded' WHEN 'recovery_required' THEN 'recovery-required' WHEN 'cancelled' THEN 'execution-cancelled' ELSE 'execution-failed' END;
  topic:=CASE NEW.status WHEN 'succeeded' THEN 'execution-success' WHEN 'recovery_required' THEN 'recovery' ELSE 'execution-failure' END;
  PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,NEW.owner_user_id,NEW.id::text||':'||NEW.status,topic,kind,'platform',NEW.id,NEW.operation);
 ELSIF TG_TABLE_NAME='application_instances' THEN
  IF NEW.deployment_policy<>'approval-required' THEN RETURN NEW; END IF;
  FOR recipient IN SELECT user_id FROM lzc.memberships WHERE tenant_id=NEW.tenant_id AND 'platform-engineer'=ANY(product_roles) AND user_id<>NEW.requested_by LOOP
   PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,recipient.user_id,NEW.id::text||':ordered','approvals','order-pending','application',NEW.id);
  END LOOP;
 ELSIF TG_TABLE_NAME='application_order_decisions' THEN
  SELECT requested_by INTO owner_id FROM lzc.application_instances WHERE id=NEW.instance_id;
  PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,owner_id,NEW.instance_id::text||':'||NEW.decision,'approvals','order-'||NEW.decision,'application',NEW.instance_id);
 ELSIF TG_TABLE_NAME='application_dispatches' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('succeeded','failed','reconciliation_required') THEN RETURN NEW; END IF;
  SELECT j.operation INTO operation FROM lzc.application_jobs j WHERE j.id=NEW.job_id;
  topic:=CASE NEW.status WHEN 'succeeded' THEN 'execution-success' WHEN 'reconciliation_required' THEN 'recovery' ELSE 'execution-failure' END;
  kind:=CASE NEW.status WHEN 'succeeded' THEN 'execution-succeeded' WHEN 'reconciliation_required' THEN 'recovery-required' ELSE 'execution-failed' END;
  FOR recipient IN SELECT DISTINCT user_id FROM unnest(ARRAY[NEW.owner_user_id,NEW.approved_by]) user_id LOOP
   PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,recipient.user_id,NEW.job_id::text||':'||NEW.status,topic,kind,'application',NEW.instance_id,operation);
  END LOOP;
 ELSIF TG_TABLE_NAME='membership_audit' THEN
  IF NEW.action NOT IN ('member_updated','member_removed','invitation_accepted','application_group_members_changed','application_group_deleted') THEN RETURN NEW; END IF;
  FOR recipient IN SELECT user_id FROM lzc.memberships WHERE tenant_id=NEW.tenant_id AND manage_members LOOP
   PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,recipient.user_id,NEW.id::text,'access','access-changed','workspace',NEW.tenant_id);
  END LOOP;
 ELSIF TG_TABLE_NAME='application_upgrade_approvals' THEN
  SELECT c.instance_id,i.requested_by INTO resource,owner_id FROM lzc.application_upgrade_candidates c JOIN lzc.application_instances i ON i.id=c.instance_id WHERE c.id=NEW.candidate_id;
  PERFORM lzc_auth.enqueue_notification(NEW.tenant_id,owner_id,NEW.candidate_id::text||':'||NEW.plan_id::text,'approvals','upgrade-approved','application',resource);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_platform_execution AFTER UPDATE OF status ON lzc.plan_runs FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();
CREATE TRIGGER notify_order AFTER INSERT ON lzc.application_instances FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();
CREATE TRIGGER notify_order_decision AFTER INSERT ON lzc.application_order_decisions FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();
CREATE TRIGGER notify_application_execution AFTER UPDATE OF status ON lzc.application_dispatches FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();
CREATE TRIGGER notify_access AFTER INSERT ON lzc_auth.membership_audit FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();
CREATE TRIGGER notify_upgrade_approval AFTER INSERT ON lzc.application_upgrade_approvals FOR EACH ROW EXECUTE FUNCTION lzc_auth.notification_event();

CREATE FUNCTION lzc_auth.enqueue_invitation_mail(p_session uuid,p_tenant uuid,p_invitation uuid,p_email text,p_locale text,p_cipher bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 u:=lzc_auth.invitation_manager(p_session,p_tenant);
 PERFORM pg_advisory_xact_lock(hashtextextended('lzc-mail-invitation:'||u::text,0));
 IF (SELECT count(*) FROM lzc_auth.notifications WHERE user_id=u AND kind='invitation' AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'invitation_email_rate_limit' USING ERRCODE='54000'; END IF;
 UPDATE lzc_auth.invitations SET recipient_email=lower(p_email) WHERE id=p_invitation AND tenant_id=p_tenant AND created_by=u AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND recipient_email IS NULL;
 IF NOT FOUND OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO lzc_auth.notifications(tenant_id,user_id,event_key,topic,kind,resource_type,resource_id,invitation_email,invitation_locale,invitation_cipher)
 VALUES(p_tenant,u,p_invitation::text||':invitation','invitations','invitation','invitation',p_invitation,lower(p_email),p_locale,p_cipher);
END $$;
-- Emailed invitations are additionally bound to the recipient's verified identity.
ALTER FUNCTION lzc_auth.use_invitation(uuid,text,boolean) RENAME TO use_invitation_bearer;
REVOKE ALL ON FUNCTION lzc_auth.use_invitation_bearer(uuid,text,boolean) FROM PUBLIC,configurator_app;
CREATE FUNCTION lzc_auth.use_invitation(p_session uuid,p_hash text,p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE recipient text; tenant uuid;
BEGIN
 PERFORM 1 FROM lzc_auth.sessions WHERE id=p_session AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='P0002'; END IF;
 SELECT tenant_id INTO tenant FROM lzc_auth.invitations WHERE token_hash=p_hash;
 PERFORM 1 FROM lzc.tenants WHERE id=tenant AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 SELECT recipient_email INTO recipient FROM lzc_auth.invitations WHERE token_hash=p_hash FOR UPDATE;
 IF recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lzc_auth.sessions s JOIN lzc.stackit_identities h ON h.user_id=s.user_id WHERE s.id=p_session AND s.expires_at>now() AND h.revoked_at IS NULL AND lower(h.email)=recipient) THEN
 RAISE EXCEPTION 'invitation_recipient_mismatch' USING ERRCODE='42501'; END IF;
 RETURN lzc_auth.use_invitation_bearer(p_session,p_hash,p_accept);
END $$;
CREATE FUNCTION lzc_auth.notification_delivery_allowed(n lzc_auth.notifications) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.notification_visible(n) AND
 (n.topic='invitations' OR n.topic=ANY(coalesce((SELECT p.email_topics FROM lzc_auth.notification_preferences p WHERE p.user_id=n.user_id),ARRAY['approvals','execution-failure','recovery','access','reminders']::text[])))
 AND (n.kind NOT IN ('order-pending','action-overdue') OR NOT EXISTS(SELECT 1 FROM lzc.application_order_decisions d WHERE d.instance_id=n.resource_id))
 AND n.created_at>now()-interval '7 days'
$$;
CREATE FUNCTION lzc_auth.notification_reminders() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; recipient record; day integer;
BEGIN
 FOR item IN SELECT i.* FROM lzc.application_instances i WHERE i.deployment_policy='approval-required' AND NOT EXISTS(SELECT 1 FROM lzc.application_order_deletions archived WHERE archived.instance_id=i.id) AND i.created_at<now()-interval '1 day' AND i.created_at>now()-interval '4 days' AND NOT EXISTS(SELECT 1 FROM lzc.application_order_decisions d WHERE d.instance_id=i.id) AND NOT EXISTS(SELECT 1 FROM lzc_auth.notifications previous WHERE previous.resource_id=i.id AND previous.kind='action-overdue' AND previous.created_at>now()-interval '1 day') ORDER BY i.created_at LIMIT 100 LOOP
  day:=floor(extract(epoch FROM now()-item.created_at)/86400);
  FOR recipient IN SELECT user_id FROM lzc.memberships WHERE tenant_id=item.tenant_id AND 'platform-engineer'=ANY(product_roles) AND user_id<>item.requested_by LOOP
   PERFORM lzc_auth.enqueue_notification(item.tenant_id,recipient.user_id,item.id::text||':reminder:'||day::text,'reminders','action-overdue','application',item.id);
  END LOOP;
 END LOOP;
 FOR item IN SELECT * FROM lzc_auth.invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND expires_at<now()+interval '1 day' ORDER BY expires_at LIMIT 100 LOOP
  PERFORM lzc_auth.enqueue_notification(item.tenant_id,item.created_by,item.id::text||':expiring','reminders','invitation-expiring','invitation',item.id);
 END LOOP;
END $$;
CREATE FUNCTION lzc_auth.notification_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE lzc_auth.notifications SET email_status='uncertain',last_error='ambiguous',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='sending' AND claimed_at<now()-interval '2 minutes';
 UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='expired',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='pending' AND created_at<now()-interval '7 days';
 UPDATE lzc_auth.invitations SET recipient_email=NULL WHERE recipient_email IS NOT NULL AND expires_at<now()-interval '90 days';
 DELETE FROM lzc_auth.notifications WHERE created_at<now()-interval '90 days';
 PERFORM lzc_auth.notification_reminders();
END $$;
CREATE FUNCTION lzc_auth.notification_delivery_claim(p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n lzc_auth.notifications;
BEGIN
 -- Never automatically resend a message whose SMTP outcome may have been lost.
 UPDATE lzc_auth.notifications SET email_status='uncertain',last_error='ambiguous',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='sending' AND claimed_at<now()-interval '2 minutes';
 UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='expired',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='pending' AND created_at<now()-interval '7 days';
 UPDATE lzc_auth.invitations SET recipient_email=NULL WHERE recipient_email IS NOT NULL AND expires_at<now()-interval '90 days';
 DELETE FROM lzc_auth.notifications WHERE created_at<now()-interval '90 days';
 PERFORM lzc_auth.notification_reminders();
 SELECT * INTO n FROM lzc_auth.notifications WHERE email_status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT lzc_auth.notification_delivery_allowed(n) THEN
  UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='authorization',invitation_cipher=NULL,invitation_email=NULL WHERE id=n.id;
  RETURN jsonb_build_object('suppressed',true);
 END IF;
 UPDATE lzc_auth.notifications SET email_status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1 WHERE id=n.id;
 RETURN jsonb_build_object('id',n.id);
END $$;
CREATE FUNCTION lzc_auth.notification_delivery_prepare(p_id uuid,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n lzc_auth.notifications; address text; locale text;
BEGIN
 SELECT * INTO n FROM lzc_auth.notifications WHERE id=p_id AND claim_id=p_claim AND email_status='sending' AND claimed_at>now()-interval '90 seconds' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT lzc_auth.notification_delivery_allowed(n) THEN
  UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='authorization',invitation_cipher=NULL,invitation_email=NULL WHERE id=n.id; RETURN NULL;
 END IF;
 IF n.kind='invitation' THEN address:=n.invitation_email;locale:=n.invitation_locale;
 ELSE
  SELECT h.email INTO address FROM lzc.stackit_identities h WHERE h.user_id=n.user_id AND h.revoked_at IS NULL;
  SELECT p.locale INTO locale FROM lzc_auth.notification_preferences p WHERE p.user_id=n.user_id;
 END IF;
 IF address IS NULL THEN UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='no-address' WHERE id=n.id; RETURN NULL; END IF;
 RETURN jsonb_build_object('id',n.id,'tenantId',n.tenant_id,'userId',n.user_id,'topic',n.topic,'kind',n.kind,'resourceType',n.resource_type,'resourceId',n.resource_id,'operation',n.operation,'email',address,'locale',coalesce(locale,'de'),'cipher',encode(n.invitation_cipher,'base64'));
END $$;
CREATE FUNCTION lzc_auth.notification_delivery_finish(p_id uuid,p_claim uuid,p_outcome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_outcome NOT IN ('accepted','temporary','rejected','ambiguous') THEN RAISE EXCEPTION 'invalid_delivery_outcome' USING ERRCODE='22023'; END IF;
 UPDATE lzc_auth.notifications SET
  email_status=CASE WHEN p_outcome='accepted' THEN 'accepted' WHEN p_outcome='temporary' AND attempts<5 THEN 'pending' WHEN p_outcome='ambiguous' THEN 'uncertain' ELSE 'failed' END,
  last_error=CASE WHEN p_outcome='accepted' THEN NULL ELSE p_outcome END,
  next_attempt_at=now()+make_interval(secs => least(3600,60*power(2,attempts)::integer)),
  accepted_at=CASE WHEN p_outcome='accepted' THEN now() ELSE NULL END,
  invitation_cipher=CASE WHEN p_outcome='temporary' AND attempts<5 THEN invitation_cipher ELSE NULL END,
  invitation_email=CASE WHEN p_outcome='temporary' AND attempts<5 THEN invitation_email ELSE NULL END
 WHERE id=p_id AND claim_id=p_claim AND email_status='sending';
END $$;
DO $$ DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lzc_auth' AND (p.proname LIKE 'notification_%' OR p.proname IN ('enqueue_notification','enqueue_invitation_mail','use_invitation')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,configurator_app',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION lzc_auth.notification_maintenance(),lzc_auth.notification_list(uuid,uuid,timestamptz),lzc_auth.notification_read(uuid,uuid,uuid),lzc_auth.notification_preferences(uuid,uuid,text,text[]),lzc_auth.enqueue_invitation_mail(uuid,uuid,uuid,text,text,bytea),lzc_auth.use_invitation(uuid,text,boolean),lzc_auth.notification_delivery_claim(uuid),lzc_auth.notification_delivery_prepare(uuid,uuid),lzc_auth.notification_delivery_finish(uuid,uuid,text) TO configurator_app;
-- Managers see delivery diagnostics for their currently open invitations.
CREATE OR REPLACE FUNCTION lzc_auth.list_invitations(p_session uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM lzc_auth.invitation_manager(p_session,p_tenant);
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'roles',i.product_roles,'manageMembers',i.manage_members,'expiresAt',i.expires_at,'createdAt',i.created_at,'mailStatus',(SELECT n.email_status FROM lzc_auth.notifications n WHERE n.resource_id=i.id AND n.kind='invitation')) ORDER BY i.created_at DESC),'[]'::jsonb)
 FROM lzc_auth.invitations i WHERE i.tenant_id=p_tenant AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>now());
END $$;
