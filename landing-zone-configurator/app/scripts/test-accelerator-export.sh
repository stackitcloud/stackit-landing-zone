#!/usr/bin/env bash
# Render once, then test the native root without API, database or execution credentials.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$app_dir/../.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set an absolute OpenTofu executable}"
case "$tofu_bin" in /*) ;; *) exit 1 ;; esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-native-export.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$work_dir/src/tests"
cp "$repo_dir/src/"*.tf "$work_dir/src/"
cp -R "$repo_dir/src/modules" "$work_dir/src/"
node "$app_dir/scripts/prepare-accelerator-export.ts" "$work_dir/src"
cli_config="${LZC_TEST_PROVIDER_CONFIG:-/dev/null}"
env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$cli_config" TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" init -backend=false -input=false -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$cli_config" TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" validate -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$cli_config" TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" test -var-file=example.tfvars -no-color
