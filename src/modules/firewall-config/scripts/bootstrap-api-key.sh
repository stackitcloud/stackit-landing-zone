#!/usr/bin/env bash
#
# Derives an OPNsense API key/secret from the appliance login.
#
# The REST API rejects the login password for basic auth (401), but it does accept a
# web GUI session cookie. With that session plus the rotating X-CSRFToken header, the
# key/secret pair can be created through /api/auth/user/addApiKey — no manual GUI step.
#
# Any previously issued API keys of the user are removed first, so a re-run is a real
# rotation: the old key stops working the moment the new one exists. Without that, a
# stale key kept in a secret store would silently stay valid forever.
#
# Usage:
#   OPNSENSE_PASSWORD='...' ./bootstrap-api-key.sh https://10.0.2.4 [username]
#
# Output: {"api_key":"...","api_secret":"..."} — written atomically to OUTPUT_FILE if
# that variable is set, to stdout otherwise. The atomic write matters when Terraform
# invokes this: a shell redirect would leave an empty file behind on failure, which the
# root module would then read as "no credentials" while half a bootstrap has happened.
#
# The root module invokes this automatically, so there is normally nothing to run by
# hand. It stays callable on its own for recovery or for seeding a secret store.

set -euo pipefail

ENDPOINT="${1:?usage: bootstrap-api-key.sh <https://host> [username]}"
USERNAME="${2:-root}"
PASSWORD="${OPNSENSE_PASSWORD:?set OPNSENSE_PASSWORD}"

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

curl_opts=(--silent --show-error --max-time 30 --insecure)

# 0) Wait for the appliance. Terraform starts this the moment the VM resource exists,
#    but OPNsense needs a few minutes to boot before the web server answers.
deadline=$((SECONDS + 600))
until login_page="$(curl --silent --max-time 10 --insecure -c "$JAR" "$ENDPOINT/")" \
  && grep -q '<input type="hidden"' <<<"$login_page"; do
  if ((SECONDS >= deadline)); then
    echo "appliance at $ENDPOINT did not serve a login page within 10 minutes" >&2
    exit 1
  fi
  sleep 15
done

# 1) The login form's CSRF field has a randomly generated name and value.
hidden="$(grep -oE '<input type="hidden" name="[^"]+" value="[^"]+"' <<<"$login_page" | head -1)"
csrf_name="$(sed -E 's/.*name="([^"]+)" value=.*/\1/' <<<"$hidden")"
csrf_value="$(sed -E 's/.*value="([^"]+)"$/\1/' <<<"$hidden")"

# 2) Authenticate and keep the session cookie.
curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" -o /dev/null \
  --data-urlencode "$csrf_name=$csrf_value" \
  --data-urlencode "usernamefld=$USERNAME" \
  --data-urlencode "passwordfld=$PASSWORD" \
  --data-urlencode "login=1" \
  "$ENDPOINT/index.php"

# 3) Grab a fresh CSRF token from an authenticated page. It rotates per request and is
#    mandatory for every API POST made with a session; without it the API returns 403.
token="$(curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" "$ENDPOINT/system_usermanager.php" \
  | grep -oE 'X-CSRFToken", "[^"]+"' | head -1 | sed -E 's/.*, "([^"]+)"/\1/')"

if [[ -z "$token" ]]; then
  echo "login failed for user '$USERNAME' — no CSRF token on an authenticated page" >&2
  exit 1
fi

api() { # api <path> [curl args...]
  local path="$1"; shift
  curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" \
    -X POST -H 'Content-Type: application/json' -H "X-CSRFToken: $token" "$@" \
    "$ENDPOINT$path"
}

# 4) Revoke every existing key of the user. The id is the key base64-encoded, and the
#    endpoint only matches it with the padding stripped — verified against a live
#    appliance, where the padded form answers "not found".
api /api/auth/user/search_api_key -d '{}' \
  | python3 -c 'import json,sys; [print(r["id"].rstrip("=")) for r in json.load(sys.stdin).get("rows",[])]' \
  | while read -r id; do
      api "/api/auth/user/del_api_key/$id" -d '{}' >/dev/null \
        || echo "warning: could not revoke old API key $id" >&2
    done

# 5) Create the key pair.
response="$(api "/api/auth/user/addApiKey/$USERNAME")"

key="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("key",""))' <<<"$response")"
secret="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("secret",""))' <<<"$response")"

if [[ -z "$key" || -z "$secret" ]]; then
  echo "API key creation failed: $response" >&2
  exit 1
fi

# JSON so Terraform can consume the file directly with jsondecode().
result="$(printf '{"api_key":"%s","api_secret":"%s"}\n' "$key" "$secret")"

if [[ -n "${OUTPUT_FILE:-}" ]]; then
  tmp="$(mktemp "${OUTPUT_FILE}.XXXX")"
  printf '%s\n' "$result" > "$tmp"
  mv "$tmp" "$OUTPUT_FILE"
else
  printf '%s\n' "$result"
fi
