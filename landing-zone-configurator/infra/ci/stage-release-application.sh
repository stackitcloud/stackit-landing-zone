#!/usr/bin/env bash
set -euo pipefail
# Staging uses a private snapshot with execution disabled and no Runner binding.
# Existing processes keep their previous environment; no new process starts.
cf push --no-start -f deploy/cloud-foundry/manifest.yml -p .local/release --vars-file "$LZC_PRIVATE/app-stage-vars.json" --redact-env
app_id="$(cf app landing-zone-configurator --guid)"
package_id="$(cf curl "/v3/packages?app_guids=$app_id&order_by=-created_at&per_page=1" | jq -er '.resources | if length == 1 and .[0].state == "READY" then .[0].guid else error("Expected a ready application package") end')"
cf stage-package landing-zone-configurator --package-guid "$package_id"
cf curl "/v3/builds?app_guids=$app_id&order_by=-created_at&per_page=1" | jq -ce --arg package "$package_id" --arg app "$app_id" '.resources | if length == 1 and .[0].state == "STAGED" and .[0].package.guid == $package then {app: $app, package: $package, build: .[0].guid, droplet: .[0].droplet.guid} else error("Application build does not match the release package") end' > "$LZC_PRIVATE/app-stage.json"
# No set-droplet/start/restart here. Activation is gated on ALL lane results.
