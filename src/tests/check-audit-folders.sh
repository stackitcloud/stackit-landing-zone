#!/usr/bin/env bash
# Real Telemetry Link validation with native scopes and mocked dependent services.
set -euo pipefail
umask 077
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set an absolute OpenTofu executable}"
case "$tofu_bin" in /*) ;; *) exit 1 ;; esac
work_dir="$(mktemp -d /tmp/lza-audit-folders.XXXXXXXX)"
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$work_dir/src/tests"
cp "$repo_dir/src/"*.tf "$work_dir/src/"
cp -R "$repo_dir/src/modules" "$work_dir/src/"
# Keep the native test inputs, mocks and the one complete coverage run.
awk '
 /^run "/ { in_run=1; depth=0; skip=($0 !~ /^run "automatic_audit_links_use_stable_keys"/) }
 { if (in_run) {
     line=$0; opens=gsub(/\{/, "", line); line=$0; closes=gsub(/\}/, "", line); depth+=opens-closes;
     if (!skip) print; if (depth==0) { in_run=0; skip=0 }
   } else print }
' "$repo_dir/src/tests/standalone.tftest.hcl" > "$work_dir/src/tests/audit.tftest.hcl"
# Only provider selection changes in this test copy; scopes come from native code.
sed -i '/resource "stackit_telemetrylink" "managed_audit" {/a\  provider = stackit.audit_validation' "$work_dir/src/audit-coverage.tf"
cat >> "$work_dir/src/providers.tf" <<'HCL'
provider "stackit" {
  alias                         = "audit_validation"
  default_region                = "eu01"
  service_account_token         = "offline-provider-validation-only"
  telemetrylink_custom_endpoint = "http://127.0.0.1:1"
}
HCL
run_tofu() {
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE="${LZC_TEST_PROVIDER_CONFIG:-/dev/null}" TF_IN_AUTOMATION=true TF_INPUT=0 \
    "$tofu_bin" -chdir="$work_dir/src" "$@"
}
run_tofu init -backend=false -input=false -no-color > "$work_dir/init.log" 2>&1 || { cat "$work_dir/init.log"; exit 1; }
run_tofu test -no-color > "$work_dir/uuid.log" 2>&1 || { cat "$work_dir/uuid.log"; exit 1; }
echo 'PASS: native audit scopes use folder UUIDs with the real Telemetry Link provider.'
# Prove the real provider rejects the readable container identifier that caused the incident.
sed -i 's/resource_id         = each.value.resource_id/resource_id         = each.value.resource_type == "folder" ? "folder-example-abc123" : each.value.resource_id/' "$work_dir/src/audit-coverage.tf"
if run_tofu test -no-color > "$work_dir/container.log" 2>&1; then
  echo 'Expected readable folder container IDs to be rejected.' >&2; exit 1
fi
if ! grep -q 'resource_id value must be an UUID' "$work_dir/container.log"; then
  cat "$work_dir/container.log"; exit 1
fi
echo 'PASS: readable folder container IDs are rejected by the real Telemetry Link provider.'
