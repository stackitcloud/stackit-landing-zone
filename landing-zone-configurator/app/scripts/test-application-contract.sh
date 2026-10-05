#!/usr/bin/env bash
# Isolated native mock-provider tests. Never load customer inputs or a backend.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$app_dir/../.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set LZC_TEST_TOFU_BIN to the pinned OpenTofu executable}"
case "$tofu_bin" in /*) ;; *) echo 'Use an absolute OpenTofu executable path.' >&2; exit 1 ;; esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-application-test.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$work_dir/src/application" "$work_dir/src/modules"
cp "$repo_dir/src/application/"*.tf "$work_dir/src/application/"
cp -R "$repo_dir/src/application/tests" "$work_dir/src/application/"
cp -R "$repo_dir/src/application/examples" "$work_dir/src/application/"
cp -R "$repo_dir/src/modules/." "$work_dir/src/modules/"
# No service-account, backend, TF_VAR, user CLI configuration or inherited CLI args.
# The checked-in fixtures mock every provider and run plan only.
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src/application" init -backend=false -input=false -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src/application" validate -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src/application" test -no-color
cp "$work_dir/src/application/.terraform.lock.hcl" "$work_dir/src/modules/landing-zone/.terraform.lock.hcl"
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src/modules/landing-zone" init -backend=false -input=false -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src/modules/landing-zone" test -no-color
