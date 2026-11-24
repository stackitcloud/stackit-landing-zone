-- Separate invitation admission from provider-wide SMTP throughput.
-- All replicas and legacy one-argument workers share this durable reservation.
ALTER TABLE lzc_auth.notifications DROP CONSTRAINT notifications_attempts_check;
ALTER TABLE lzc_auth.notifications ADD CONSTRAINT notifications_attempts_check CHECK(attempts BETWEEN 0 AND 1000);
CREATE TABLE lzc_auth.notification_delivery_schedule (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 next_send_at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO lzc_auth.notification_delivery_schedule(singleton) VALUES(true);
REVOKE ALL ON lzc_auth.notification_delivery_schedule FROM PUBLIC,configurator_app;
CREATE OR REPLACE FUNCTION lzc_auth.enqueue_invitation_mail(p_session uuid,p_tenant uuid,p_invitation uuid,p_email text,p_locale text,p_cipher bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;
BEGIN
 u:=lzc_auth.invitation_manager(p_session,p_tenant);
 PERFORM pg_advisory_xact_lock(hashtextextended('lzc-mail-invitation:'||u::text,0));
 IF (SELECT count(*) FROM lzc_auth.notifications WHERE user_id=u AND kind='invitation' AND created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'invitation_email_rate_limit' USING ERRCODE='54000'; END IF;
 UPDATE lzc_auth.invitations SET recipient_email=lower(p_email) WHERE id=p_invitation AND tenant_id=p_tenant AND created_by=u AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND recipient_email IS NULL;
 IF NOT FOUND OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO lzc_auth.notifications(tenant_id,user_id,event_key,topic,kind,resource_type,resource_id,invitation_email,invitation_locale,invitation_cipher)
 VALUES(p_tenant,u,p_invitation::text||':invitation','invitations','invitation','invitation',p_invitation,lower(p_email),p_locale,p_cipher);
END $$;
CREATE FUNCTION lzc_auth.notification_delivery_claim(p_claim uuid,p_interval_seconds integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n lzc_auth.notifications;
BEGIN
 IF p_interval_seconds IS NULL OR p_interval_seconds NOT BETWEEN 4 AND 3600 THEN RAISE EXCEPTION 'invalid_delivery_interval' USING ERRCODE='22023'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('lzc-mailout-dispatch',0)) THEN RETURN NULL; END IF;
 -- Never automatically resend a message whose SMTP outcome may have been lost.
 UPDATE lzc_auth.notifications SET email_status='uncertain',last_error='ambiguous',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='sending' AND claimed_at<now()-interval '2 minutes';
 UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='expired',invitation_cipher=NULL,invitation_email=NULL WHERE email_status='pending' AND created_at<now()-interval '7 days';
 UPDATE lzc_auth.invitations SET recipient_email=NULL WHERE recipient_email IS NOT NULL AND expires_at<now()-interval '90 days';
 DELETE FROM lzc_auth.notifications WHERE created_at<now()-interval '90 days';
 PERFORM lzc_auth.notification_reminders();
 IF (SELECT next_send_at FROM lzc_auth.notification_delivery_schedule WHERE singleton) > clock_timestamp() THEN RETURN NULL; END IF;
 SELECT * INTO n FROM lzc_auth.notifications WHERE email_status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT lzc_auth.notification_delivery_allowed(n) THEN
  UPDATE lzc_auth.notifications SET email_status='suppressed',last_error='authorization',invitation_cipher=NULL,invitation_email=NULL WHERE id=n.id;
  RETURN jsonb_build_object('suppressed',true);
 END IF;
 UPDATE lzc_auth.notification_delivery_schedule SET next_send_at=clock_timestamp()+make_interval(secs=>p_interval_seconds) WHERE singleton;
 UPDATE lzc_auth.notifications SET email_status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1 WHERE id=n.id;
 RETURN jsonb_build_object('id',n.id);
END $$;
CREATE OR REPLACE FUNCTION lzc_auth.notification_delivery_claim(p_claim uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lzc_auth.notification_delivery_claim(p_claim,360)
$$;
CREATE OR REPLACE FUNCTION lzc_auth.notification_delivery_finish(p_id uuid,p_claim uuid,p_outcome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_outcome NOT IN ('accepted','temporary','rejected','ambiguous') THEN RAISE EXCEPTION 'invalid_delivery_outcome' USING ERRCODE='22023'; END IF;
 UPDATE lzc_auth.notifications SET
  email_status=CASE WHEN p_outcome='accepted' THEN 'accepted' WHEN p_outcome='temporary' AND attempts<1000 AND created_at>now()-interval '7 days' THEN 'pending' WHEN p_outcome='ambiguous' THEN 'uncertain' ELSE 'failed' END,
  last_error=CASE WHEN p_outcome='accepted' THEN NULL ELSE p_outcome END,
  next_attempt_at=now()+make_interval(secs => least(3600,60*power(2,least(attempts,6))::integer)),
  accepted_at=CASE WHEN p_outcome='accepted' THEN now() ELSE NULL END,
  invitation_cipher=CASE WHEN p_outcome='temporary' AND attempts<1000 AND created_at>now()-interval '7 days' THEN invitation_cipher ELSE NULL END,
  invitation_email=CASE WHEN p_outcome='temporary' AND attempts<1000 AND created_at>now()-interval '7 days' THEN invitation_email ELSE NULL END
 WHERE id=p_id AND claim_id=p_claim AND email_status='sending';
END $$;
REVOKE ALL ON FUNCTION lzc_auth.notification_delivery_claim(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lzc_auth.notification_delivery_claim(uuid,integer) TO configurator_app;
