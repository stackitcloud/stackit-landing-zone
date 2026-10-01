#!/usr/bin/env bash
# Real reviewed module, mock providers, plan only; never inherits cloud credentials.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set LZC_TEST_TOFU_BIN to OpenTofu 1.12.6}"
case "$tofu_bin" in /*) ;; *) echo 'Absolute OpenTofu path required.' >&2; exit 1 ;; esac
case "$("$tofu_bin" version -json | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).terraform_version));')" in
  1.12.6) ;; *) echo 'OpenTofu 1.12.6 required.' >&2; exit 1 ;;
esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-governance-test.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
node "$app_dir/scripts/prepare-governance-contract.ts" "$work_dir"
: > "$work_dir/empty.tfrc"
env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$work_dir/empty.tfrc" TF_IN_AUTOMATION=true TF_INPUT=0 "$tofu_bin" -chdir="$work_dir" init -backend=false -lockfile=readonly -input=false -no-color
env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$work_dir/empty.tfrc" TF_IN_AUTOMATION=true TF_INPUT=0 "$tofu_bin" -chdir="$work_dir" test -no-color
