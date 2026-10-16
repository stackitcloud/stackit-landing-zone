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
mkdir -p "$work_dir/standalone-input"
cp "$repo_dir/src/variables.tf" "$work_dir/standalone-input/"
printf '%s\n' 'jsonencode({ corporate = var.landing_zones["public-exmpl"].corporate, connectivity = var.connectivity })' |
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
    "$tofu_bin" -chdir="$work_dir/standalone-input" console -var-file="$repo_dir/src/config/standalone.tfvars" |
  node --input-type=module -e '
    import assert from "node:assert/strict";
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const example = JSON.parse(JSON.parse(input));
    assert.equal(example.corporate, false);
    assert.equal(example.connectivity, null);
    console.log("PASS: actual Standalone example is Public without connectivity.");
  '
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" providers schema -json |
  node --input-type=module -e '
    import assert from "node:assert/strict";
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const provider = Object.entries(JSON.parse(input).provider_schemas).find(([name]) => name.endsWith("/stackitcloud/stackit"))?.[1];
    const attributes = provider?.resource_schemas?.stackit_resourcemanager_folder?.block?.attributes;
    assert.ok(attributes);
    assert.equal(Object.hasOwn(attributes, "description"), false, "Folder schema changed: qualify description support instead of retaining the unsupported-input contract.");
    console.log("PASS: reviewed provider does not support folder descriptions.");
  '
env -i PATH="$PATH" TF_CLI_CONFIG_FILE=/dev/null TF_IN_AUTOMATION=true TF_INPUT=0 \
  "$tofu_bin" -chdir="$work_dir/src" test -no-color