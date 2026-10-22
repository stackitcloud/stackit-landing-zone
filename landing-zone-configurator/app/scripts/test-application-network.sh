#!/usr/bin/env bash
# Real pinned provider, fresh local state, synthetic input, plan only.
# Provider mocks bypass the IPv4 ValidateConfig check this regression exercises.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set LZC_TEST_TOFU_BIN to the pinned OpenTofu executable}"
case "$tofu_bin" in /*) ;; *) echo 'Absolute OpenTofu path required.' >&2; exit 1 ;; esac
provider_dir="${1:-}"
if [[ -n "$provider_dir" ]]; then
  case "$provider_dir" in /*) ;; *) echo 'Absolute provider directory required.' >&2; exit 1 ;; esac
  [[ -d "$provider_dir" ]] || { echo 'Provider directory does not exist.' >&2; exit 1; }
fi
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-application-network.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
# Keep the exact Runner provider checksums; no unrelated providers are required.
awk '/^provider .*stackitcloud\/stackit/ { copy=1 } copy { print } copy && /^}/ { copy=0 }' \
  "$app_dir/../deploy/runner/application.lock.hcl" > "$work_dir/.terraform.lock.hcl"
[[ -s "$work_dir/.terraform.lock.hcl" ]] || { echo 'Pinned STACKIT lock entry missing.' >&2; exit 1; }
cat > "$work_dir/main.tf" <<'HCL'
terraform {
  required_providers {
    stackit = { source = "stackitcloud/stackit", version = "0.114.0" }
  }
}
provider "stackit" {
  default_region        = "eu01"
  service_account_token = "offline-provider-validation-only"
  # Any accidental IaaS request fails locally. There is no customer endpoint/key.
  iaas_custom_endpoint  = "http://127.0.0.1:1"
}
variable "prefix_length" {
  type     = number
  nullable = true
}
variable "nameservers" {
  type     = list(string)
  nullable = true
}
variable "deferred" {
  type    = bool
  default = false
}
resource "terraform_data" "prefix" {
  count = var.deferred ? 1 : 0
  input = 28
}
resource "stackit_network" "corporate" {
  name               = "offline-corporate-validation"
  project_id         = "11111111-2222-4333-8444-555555555555"
  routed             = true
  ipv4_prefix_length = var.deferred ? terraform_data.prefix[0].output : var.prefix_length
  ipv4_nameservers   = var.nameservers
}
HCL
run_tofu() {
  # Never inherit credentials, TF_VAR/CLI arguments, user CLI config or a backend.
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
    "$tofu_bin" -chdir="$work_dir" "$@"
}
init_args=(-backend=false -lockfile=readonly -input=false -no-color)
if [[ -n "$provider_dir" ]]; then init_args+=("-plugin-dir=$provider_dir"); fi
run_tofu init "${init_args[@]}" > "$work_dir/init.log" 2>&1 || { cat "$work_dir/init.log" >&2; exit 1; }
# validate sees unknown input values; only a real provider Plan catches null+DNS.
run_tofu validate -no-color > "$work_dir/validate.log" 2>&1 || { cat "$work_dir/validate.log" >&2; exit 1; }
run_case() {
  local case_name="$1" prefix="$2" nameservers="$3" expected="$4" deferred="${5:-false}"
  local plan_file="$work_dir/$case_name.plan" log_file="$work_dir/$case_name.log"
  printf '{"prefix_length":%s,"nameservers":%s,"deferred":%s}\n' "$prefix" "$nameservers" "$deferred" > "$work_dir/values.tfvars.json"
  if run_tofu plan -refresh=false -lock=false -input=false -no-color \
    "-var-file=$work_dir/values.tfvars.json" "-out=$plan_file" > "$log_file" 2>&1; then
    if [[ "$expected" != success ]]; then
      echo "Expected Invalid IPv4 configuration: $case_name" >&2; exit 1
    fi
    run_tofu show -json "$plan_file" > "$work_dir/plan.json"
    node --input-type=module - "$work_dir/plan.json" "$prefix" "$deferred" <<'JS'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(plan.resource_changes.length, process.argv[4] === "true" ? 2 : 1);
const network = plan.resource_changes.find(entry => entry.type === "stackit_network");
assert.equal(network.type, 'stackit_network');
assert.deepEqual(network.change.actions, ['create']);
assert.equal(network.change.after.routed, true);
if (process.argv[4] === "true")
  assert.equal(network.change.after_unknown.ipv4_prefix_length, true);
else if (process.argv[3] !== 'null')
  assert.equal(network.change.after.ipv4_prefix_length, Number(process.argv[3]));
JS
  else
    if [[ "$expected" != invalid ]]; then cat "$log_file" >&2; exit 1; fi
    if ! grep -q '^Error: Invalid IPv4 configuration$' "$log_file" ||
       ! grep -q "must provide either 'ipv4_prefix' or" "$log_file"; then
      cat "$log_file" >&2; exit 1
    fi
  fi
  echo "Real STACKIT network provider: $case_name passed ($expected)."
}
run_case missing_prefix_with_dns null '["192.0.2.53"]' invalid
run_case missing_prefix_with_empty_dns null '[]' invalid
run_case inherited_sna_prefix_28 28 '["192.0.2.53"]' success
run_case explicit_prefix_24 24 '["192.0.2.53"]' success
run_case explicit_prefix_26 26 '["192.0.2.53"]' success
run_case automatic_without_dns null null success
run_case deferred_sna_prefix null '["192.0.2.53"]' success true
