#!/usr/bin/env bash
#
# Pushes the primary's configuration to the HA peer and restarts the peer's services:
# POST /api/core/hasync_status/restart_all, which runs `system ha exec exec_sync` under
# the hood (verified against the stable/26.1 HasyncStatusController source). This is the
# API twin of the GUI's "Synchronize and reconfigure all" button.
#
# Needed because OPNsense's XMLRPC config sync only fires on GUI saves — configuration
# written through the REST API (i.e. everything OpenTofu does) is never replicated on
# its own (measured 2026-08-02: policy applied via API, peer stayed empty until this
# endpoint was called). The peer's CARP VIP survives the sync because configure-ha.sh
# creates it with nosync=1.
#
# Authenticates with the admin login through a GUI session cookie + CSRF token, like
# bootstrap-api-key.sh.
#
# Usage:
#   OPNSENSE_PASSWORD='...' ./sync-ha-peer.sh <https://host>

set -euo pipefail

ENDPOINT="${1:?usage: sync-ha-peer.sh <https://host>}"
USERNAME="${OPNSENSE_USERNAME:-root}"
PASSWORD="${OPNSENSE_PASSWORD:?set OPNSENSE_PASSWORD}"

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

curl_opts=(--silent --show-error --max-time 30 --insecure)

login_page="$(curl --silent --max-time 10 --insecure -c "$JAR" "$ENDPOINT/")"
hidden="$(grep -oE '<input type="hidden" name="[^"]+" value="[^"]+"' <<<"$login_page" | head -1)"
csrf_name="$(sed -E 's/.*name="([^"]+)" value=.*/\1/' <<<"$hidden")"
csrf_value="$(sed -E 's/.*value="([^"]+)"$/\1/' <<<"$hidden")"

curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" -o /dev/null \
  --data-urlencode "$csrf_name=$csrf_value" \
  --data-urlencode "usernamefld=$USERNAME" \
  --data-urlencode "passwordfld=$PASSWORD" \
  --data-urlencode "login=1" \
  "$ENDPOINT/index.php"

token="$(curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" "$ENDPOINT/system_usermanager.php" \
  | grep -oE 'X-CSRFToken", "[^"]+"' | head -1 | sed -E 's/.*, "([^"]+)"/\1/')"

if [[ -z "$token" ]]; then
  echo "login failed for user '$USERNAME' — no CSRF token on an authenticated page" >&2
  exit 1
fi

# The call restarts every service on the peer, so give it more headroom than usual.
response="$(curl --silent --show-error --max-time 180 --insecure -b "$JAR" -c "$JAR" \
  -X POST -H 'Content-Type: application/json' -H "X-CSRFToken: $token" -d '{}' \
  "$ENDPOINT/api/core/hasync_status/restart_all")"

status="$(jq -r '.status // empty' <<<"$response" 2>/dev/null || true)"
if [[ "$status" != "ok" ]]; then
  echo "FATAL: HA config sync failed: $response" >&2
  exit 1
fi

echo "HA peer synchronized: $response"
