#!/usr/bin/env bash
set -euo pipefail
export CF_HOME="$LZC_PRIVATE/cf-migration"
cf api "$CF_API_URL"
cf auth
cf target -o lzc-dev -s configurator
test "$(cf space configurator --guid)" = "$LZC_CF_SPACE_ID"
trap 'cf delete landing-zone-configurator-migrate -f' EXIT
cf push --task -f deploy/cloud-foundry/migration-manifest.yml -p .local/migration --vars-file "$LZC_PRIVATE/migration-vars.json" --redact-env
migration_status=0
cf run-task landing-zone-configurator-migrate --command "./runtime/bin/node apps/api/dist/migrate.js $GITHUB_RUN_ID" --name "migrate-$GITHUB_RUN_ID" -m 128M -k 4096M --wait || migration_status=$?
evidence_status=1
for attempt in 1 2 3; do
  if cf logs landing-zone-configurator-migrate --recent | node infra/ci/migration-evidence.mjs "$GITHUB_RUN_ID" > "$LZC_PRIVATE/migration-evidence.json"; then
    cat "$LZC_PRIVATE/migration-evidence.json"
    evidence_status=0
    break
  fi
  if [ -s "$LZC_PRIVATE/migration-evidence.json" ]; then
    cat "$LZC_PRIVATE/migration-evidence.json"
    break
  fi
  if [ "$attempt" -lt 3 ]; then sleep 5; fi
done
test "$migration_status" = 0
test "$evidence_status" = 0
# Explicit cleanup failure is a failed lane; EXIT remains a second cleanup attempt.
cf delete landing-zone-configurator-migrate -f
trap - EXIT
