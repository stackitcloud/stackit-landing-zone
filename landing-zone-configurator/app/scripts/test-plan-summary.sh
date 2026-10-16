#!/usr/bin/env bash
# Local engine contract test only. Never applies or uses a customer configuration.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set LZC_TEST_TOFU_BIN to the pinned OpenTofu 1.12.6 executable}"
case "$tofu_bin" in /*) ;; *) echo 'Use an absolute OpenTofu executable path.' >&2; exit 1 ;; esac
case "$("$tofu_bin" version -json | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).terraform_version));')" in
  1.12.6) ;; *) echo 'OpenTofu 1.12.6 required.' >&2; exit 1 ;;
esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-plan-test.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
cp "$app_dir/integration/fixtures/plan-summary/main.tf" "$work_dir/main.tf"
# Do not inherit CLI arguments, workspace selection, logging or data directories.
unset TF_CLI_ARGS TF_CLI_ARGS_init TF_CLI_ARGS_validate TF_CLI_ARGS_plan TF_CLI_ARGS_show TF_WORKSPACE TF_DATA_DIR TF_LOG TF_LOG_PATH
export TF_IN_AUTOMATION=true TF_INPUT=0
"$tofu_bin" -chdir="$work_dir" init -input=false -no-color
"$tofu_bin" -chdir="$work_dir" validate -no-color
set +e
"$tofu_bin" -chdir="$work_dir" plan -input=false -no-color -detailed-exitcode -out=plan.bin > "$work_dir/plan.log" 2>&1
plan_exit=$?
set -e
if [ "$plan_exit" -ne 2 ]; then echo "Plan test failed (exit $plan_exit); raw diagnostics withheld." >&2; exit 1; fi
"$tofu_bin" -chdir="$work_dir" show -json plan.bin > "$work_dir/plan.json"
node --input-type=module - "$app_dir" "$work_dir/plan.json" <<'JS'
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { summarizePlan } = await import(pathToFileURL(`${process.argv[2]}/apps/worker/dist/plans/summary.js`));
const summary = summarizePlan(JSON.parse(readFileSync(process.argv[3], 'utf8')), 2);
assert.equal(summary.resources.create, 1);
assert.equal(summary.changedOutputs, 1);
assert.equal(summary.applyAllowed, false);
assert.equal(summary.result, 'changes');
assert.ok(!JSON.stringify(summary).includes('private-spike-value'));
console.log('Real OpenTofu plan summary passed; no apply executed.');
JS
