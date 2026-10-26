#!/usr/bin/env bash
set -euo pipefail
export CF_HOME="$LZC_PRIVATE/cf-runner"
cf api "$CF_API_URL"
CF_USERNAME="$LZC_RUNNER_CF_USERNAME" CF_PASSWORD="$LZC_RUNNER_CF_PASSWORD" cf auth
cf target -o lzc-dev-runners -s plans
test "$(cf org lzc-dev-runners --guid)" = "$LZC_RUNNER_ORG_ID"
test "$(cf space plans --guid)" = "$LZC_RUNNER_SPACE_ID"
cf push --task -f deploy/runner/manifest.yml -p .local/runner --vars-file "$LZC_PRIVATE/runner-vars.json" --redact-env
export LZC_RUNNER_TEMPLATE_ID="$(cf app lzc-plan-template --guid)"
export LZC_RUNNER_DROPLET_ID="$(cf curl "/v3/apps/$LZC_RUNNER_TEMPLATE_ID/droplets/current" | jq -er '.guid')"
node infra/ci/prepare-release.mjs runner
touch "$LZC_PRIVATE/runner-staged"
cf run-task lzc-plan-template --command "./runtime/bin/node --input-type=module -e 'import { platformFirewallImage } from \"@lzc/contracts\"; console.log(platformFirewallImage.sha256 + \"  accelerator/firewall-image.qcow2\");' | sha256sum --check" --name "image-$GITHUB_RUN_ID" -m 128M -k 4096M --wait
cf run-task lzc-plan-template --command 'TF_CLI_CONFIG_FILE=/home/vcap/app/runner.tfrc ./tools/tofu -chdir=accelerator init -backend=false -input=false -lockfile=readonly -no-color && ./tools/tofu -chdir=accelerator validate -no-color' --name "engine-$GITHUB_RUN_ID" -m 1024M -k 4096M --wait
cf run-task lzc-plan-template --command 'TF_CLI_CONFIG_FILE=/home/vcap/app/runner.tfrc ./tools/tofu -chdir=application-src/application init -backend=false -input=false -lockfile=readonly -no-color && ./tools/tofu -chdir=application-src/application validate -no-color' --name "application-engine-$GITHUB_RUN_ID" -m 1024M -k 4096M --wait
