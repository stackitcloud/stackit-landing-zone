#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set LZC_TEST_TOFU_BIN to an absolute OpenTofu executable}"
case "$tofu_bin" in /*) ;; *) exit 1 ;; esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lza-cli-contract.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$work_dir/src/tests"
cp "$repo_dir/src/"*.tf "$work_dir/src/"
cp -R "$repo_dir/src/modules" "$work_dir/src/"
cp "$repo_dir/src/tests/standalone.tftest.hcl" "$work_dir/src/tests/"
cp "$repo_dir/src/tests/hub_spoke.tftest.hcl" "$work_dir/src/tests/"
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" init -backend=false -input=false -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" validate -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" test -no-color