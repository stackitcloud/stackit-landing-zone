-- Permit IAM intent changes before Plan; the actual saved Plan remains decisive.
DO $$ DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('lzc_auth.request_application_upgrade(uuid,uuid,uuid,uuid,uuid,jsonb,boolean)'::regprocedure);
 anchor:=$anchor$ARRAY['env','owner_email','initial_owner_email','network_enabled'$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'application_upgrade_identity_guard_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$ARRAY['env','owner_email','network_enabled'$replacement$);
 definition:=pg_get_functiondef('lzc_auth.assert_application_upgrade_plan(uuid,text,boolean)'::regprocedure);
 anchor:=$anchor$OR summary#>>'{resources,delete}' IS DISTINCT FROM '0' OR summary#>>'{resources,replace}' IS DISTINCT FROM '0'
  OR summary->>'destructive' IS DISTINCT FROM 'false'$anchor$;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'application_upgrade_plan_guard_changed'; END IF;
 EXECUTE replace(definition,anchor,$replacement$OR (
   (summary#>>'{resources,delete}'='0' AND summary#>>'{resources,replace}'='0' AND summary->>'destructive'='false')
   OR (summary->>'destructive'='true' AND summary#>>'{upgradeSafety,classification}'='sensitive'
    AND jsonb_typeof(summary#>'{upgradeSafety,iamActions,delete}')='number'
    AND jsonb_typeof(summary#>'{upgradeSafety,iamActions,replace}')='number'
    AND summary#>>'{resources,delete}'=summary#>>'{upgradeSafety,iamActions,delete}'
    AND summary#>>'{resources,replace}'=summary#>>'{upgradeSafety,iamActions,replace}'
    AND (summary#>>'{upgradeSafety,iamActions,delete}')::integer>=0
    AND (summary#>>'{upgradeSafety,iamActions,replace}')::integer>=0
    AND (summary#>>'{upgradeSafety,iamActions,delete}')::integer+(summary#>>'{upgradeSafety,iamActions,replace}')::integer BETWEEN 1 AND 1000
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(summary#>'{upgradeSafety,reasons}') r WHERE r->>'code'='plan-iam-transition' AND r->>'classification'='sensitive'))
  ) IS NOT TRUE$replacement$);
END $$;
