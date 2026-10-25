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
touch "$work_dir/landing-zone.tfvars"
(
  cd "$work_dir"
  PATH="$(dirname "$tofu_bin"):$PATH" bash "$app_dir/../deploy/runner/run-plan.sh" planning initial-plan-only
)
plan_exit="$(cat "$work_dir/plan.exit")"
if [ "$plan_exit" -ne 2 ]; then echo "Plan test failed (exit $plan_exit); raw diagnostics withheld." >&2; exit 1; fi
node --input-type=module - "$app_dir" "$work_dir/plan.json" <<'JS'
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { summarizePlan } = await import(pathToFileURL(`${process.argv[2]}/apps/worker/dist/plans/summary.js`));
const { openTofuProgress } = await import(pathToFileURL(`${process.argv[2]}/packages/contracts/dist/index.js`));
const summary = summarizePlan(JSON.parse(readFileSync(process.argv[3], 'utf8')), 2);
assert.equal(summary.resources.create, 1);
assert.equal(summary.changedOutputs, 1);
assert.equal(summary.applyAllowed, false);
assert.equal(summary.result, 'changes');
assert.ok(!JSON.stringify(summary).includes('private-spike-value'));
const directory = new URL('.', pathToFileURL(process.argv[3]));
const progress = openTofuProgress(readFileSync(new URL('plan-events.log', directory), 'utf8'));
assert.equal(progress.invalid, false);
assert.match(progress.text, /Plan: 1 to add/);
assert.ok(!progress.text.includes('private-spike-value'));
const human = readFileSync(new URL('plan.log', directory), 'utf8');
assert.match(human, /Plan: 1 to add/);
assert.ok(human.includes('private-spike-value'), 'Normal attribute values remain visible in the full plan');
assert.match(human, /private_output\s*=\s*\(sensitive value\)/);
console.log('Real OpenTofu native UI, full saved-plan text and summary passed; no apply executed.');
JS
LZC_TEST_TOFU_BIN="$tofu_bin" node "$app_dir/node_modules/vitest/vitest.mjs" run "$app_dir/tests/application-recovery-serial-native.test.ts"
