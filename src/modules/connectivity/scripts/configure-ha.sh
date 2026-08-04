#!/usr/bin/env bash
#
# Configures the node-local half of the OPNsense HA pair: the CARP virtual IP on the LAN
# and the pfsync/XMLRPC synchronization settings. Everything else (rules, NAT, aliases)
# reaches the backup through the XMLRPC sync this script switches on.
#
# CARP runs in unicast mode on purpose. Measured on STACKIT (2026-08-02): the fabric
# delivers frames *to* the CARP virtual MAC, but advertisements sourced *from* the shared
# virtual MAC never reach the peer — multicast CARP therefore splits the brain, while
# unicast advertisements (sent from the real MAC) elect cleanly with sub-second failover.
#
# Authenticates with the admin login through a GUI session cookie + CSRF token, exactly
# like ../../firewall-config/scripts/bootstrap-api-key.sh, so it works on a node the OpenTofu provider has no API key
# for. Idempotent: the VIP is matched by vhid, settings are overwritten in place.
#
# Usage:
#   OPNSENSE_PASSWORD='...' LAN_VIP_CIDR=10.0.2.6/28 VHID=1 CARP_PASSWORD='...' \
#   PEER_LAN_IP=10.0.2.5 [SYNC_TO_ENDPOINT=https://10.0.2.5] \
#   ./configure-ha.sh <https://host> <primary|backup>
#
#   role primary: advskew 0, XMLRPC sync target SYNC_TO_ENDPOINT (rules/aliases/NAT
#                 replicate to the peer)
#   role backup:  advskew 100, pfsync only

set -euo pipefail

ENDPOINT="${1:?usage: configure-ha.sh <https://host> <primary|backup>}"
ROLE="${2:?usage: configure-ha.sh <https://host> <primary|backup>}"
USERNAME="${OPNSENSE_USERNAME:-root}"
PASSWORD="${OPNSENSE_PASSWORD:?set OPNSENSE_PASSWORD}"
LAN_VIP_CIDR="${LAN_VIP_CIDR:?set LAN_VIP_CIDR (e.g. 10.0.2.6/28)}"
VHID="${VHID:?set VHID}"
CARP_PASSWORD="${CARP_PASSWORD:?set CARP_PASSWORD}"
PEER_LAN_IP="${PEER_LAN_IP:?set PEER_LAN_IP}"

case "$ROLE" in
  primary) ADVSKEW=0 ;;
  backup)  ADVSKEW=100 ;;
  *) echo "role must be primary or backup, got '$ROLE'" >&2; exit 1 ;;
esac

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

curl_opts=(--silent --show-error --max-time 30 --insecure)

# 0) Wait for the appliance, then log in (see ../../firewall-config/scripts/bootstrap-api-key.sh
#    for the mechanics).
deadline=$((SECONDS + 600))
until login_page="$(curl --silent --max-time 10 --insecure -c "$JAR" "$ENDPOINT/")" \
  && grep -q '<input type="hidden"' <<<"$login_page"; do
  if ((SECONDS >= deadline)); then
    echo "appliance at $ENDPOINT did not serve a login page within 10 minutes" >&2
    exit 1
  fi
  sleep 15
done

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

api() { # api <path> [curl args...]
  local path="$1"; shift
  curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" \
    -X POST -H 'Content-Type: application/json' -H "X-CSRFToken: $token" "$@" \
    "$ENDPOINT$path"
}

apiget() { # apiget <path>
  local path="$1"
  curl "${curl_opts[@]}" -b "$JAR" -c "$JAR" -H "X-CSRFToken: $token" "$ENDPOINT$path"
}

jqr() { jq -r "$1" 2>/dev/null || true; }

# 1) Unicast CARP needs the item-level "peer" field (OPNsense >= 24.7). /get only shows
#    the list container, so the item model comes from /get_item.
vip_item_model="$(apiget /api/interfaces/vip_settings/get_item)"
if ! jq -e '.vip | has("peer")' <<<"$vip_item_model" >/dev/null; then
  echo "FATAL: the VIP item model at $ENDPOINT has no unicast 'peer' field — this OPNsense" >&2
  echo "cannot run unicast CARP, and multicast CARP splits the brain on STACKIT. Refusing." >&2
  exit 1
fi

network="${LAN_VIP_CIDR%/*}"
prefix="${LAN_VIP_CIDR#*/}"

# 2) Upsert the CARP VIP, matched by vhid. nosync keeps it out of the XMLRPC sync: each
#    node's VIP carries its own advskew and unicast peer, replication would clobber both.
existing_uuid="$(api /api/interfaces/vip_settings/search_item -d '{"current":1,"rowCount":500}' \
  | jq -r --arg vhid "$VHID" \
      '.rows[] | select(((.vhid // .vhid_txt // "") | tostring | split(" ")[0]) == $vhid) | .uuid' | head -1)"

vip_payload="$(jq -n \
  --arg interface "lan" \
  --arg network "$network" \
  --arg prefix "$prefix" \
  --arg vhid "$VHID" \
  --arg advskew "$ADVSKEW" \
  --arg password "$CARP_PASSWORD" \
  --arg peer "$PEER_LAN_IP" \
  '{vip: {interface: $interface, mode: "carp", network: ($network + "/" + $prefix),
          vhid: $vhid, advbase: "1", advskew: $advskew, password: $password,
          peer: $peer, nosync: "1",
          descr: "ha-lan-vip (managed by configure-ha.sh)"}}')"

if [[ -n "$existing_uuid" ]]; then
  result="$(api "/api/interfaces/vip_settings/set_item/$existing_uuid" -d "$vip_payload")"
else
  result="$(api /api/interfaces/vip_settings/add_item -d "$vip_payload")"
fi
if [[ "$(jqr '.result' <<<"$result")" != "saved" ]]; then
  echo "FATAL: VIP save failed: $result" >&2
  exit 1
fi
api /api/interfaces/vip_settings/reconfigure -d '{}' >/dev/null

# 3) hasync: pfsync over the LAN (unicast peer), XMLRPC target on the primary only.
#    Field names differ slightly across releases; discover what exists and set only that.
hasync_model="$(apiget /api/core/hasync/get)"
declare -A want=(
  [pfsyncinterface]="lan"
  [pfsyncpeerip]="$PEER_LAN_IP"
  [pfsyncenabled]="1"
  [disablepreempt]="0"
)
if [[ "$ROLE" == "primary" ]]; then
  want[synchronizetoip]="${SYNC_TO_ENDPOINT:?primary role needs SYNC_TO_ENDPOINT}"
  want[username]="$USERNAME"
  want[password]="$PASSWORD"
fi

hasync_payload="{}"
for key in "${!want[@]}"; do
  if jq -e --arg k "$key" '.hasync | has($k)' <<<"$hasync_model" >/dev/null; then
    hasync_payload="$(jq --arg k "$key" --arg v "${want[$key]}" '. + {($k): $v}' <<<"$hasync_payload")"
  else
    echo "note: hasync model has no field '$key', skipping" >&2
  fi
done

# syncitems stays at the OPNsense default (everything). The one item that must not
# replicate — this node's VIP with its own advskew and unicast peer — is excluded via
# nosync on the VIP itself. The sync only ever runs when firewall-config's ha_sync
# trigger fires it; OPNsense never fires it on its own for API-written config.

result="$(api /api/core/hasync/set -d "$(jq -n --argjson h "$hasync_payload" '{hasync: $h}')")"
if [[ "$(jqr '.result' <<<"$result")" == "failed" ]]; then
  echo "FATAL: hasync save failed: $result" >&2
  exit 1
fi
api /api/core/hasync/reconfigure -d '{}' >/dev/null 2>&1 || true

# 4) Verify the election result. Give CARP a moment to converge first.
sleep 10
vip_status="$(apiget /api/diagnostics/interface/get_vip_status)"
status="$(jq -r --arg vhid "$VHID" '.rows[]? | select((.vhid // "" | tostring) == $vhid) | .status' <<<"$vip_status" | head -1)"

expected="MASTER"; [[ "$ROLE" == "backup" ]] && expected="BACKUP"
echo "vip status on $ENDPOINT: vhid=$VHID status=${status:-unknown} (expected $expected)"
if [[ "${status^^}" != "$expected" ]]; then
  # Not fatal: right after configuring the backup the primary does not exist yet, and
  # the pair converges once both sides run. The OpenTofu ordering (backup first,
  # primary last) makes the primary's check the authoritative one.
  echo "warning: CARP state on $ENDPOINT is '${status:-unknown}', expected $expected for role $ROLE" >&2
  [[ "$ROLE" == "primary" ]] && exit 1
fi

echo "HA configuration for role $ROLE at $ENDPOINT complete."
