#!/usr/bin/env bash
# Credential-free source/compiler compatibility. Every provider is mocked;
# the mirror supplies schemas only. No customer State, backend or cloud API.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
tofu_bin="${LZC_TEST_TOFU_BIN:?Set the pinned absolute OpenTofu executable}"
provider_mirror="${LZC_TEST_PROVIDER_MIRROR:?Set an absolute offline Runner provider mirror}"
case "$tofu_bin:$provider_mirror" in /*:/*) ;; *) echo 'Absolute tool and mirror paths required.' >&2; exit 1 ;; esac
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lzc-execution-contract.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
cd "$app_dir"
node --input-type=module -e 'import {writeFileSync} from "node:fs";const p=JSON.stringify(process.argv[2]).replaceAll("${","$${").replaceAll("%{","%%{");writeFileSync(process.argv[1],`provider_installation {\n filesystem_mirror {\n path = ${p}\n }\n}\ndisable_checkpoint=true\n`,{flag:"wx",mode:0o600});' "$work_dir/mirror.tfrc" "$provider_mirror"
checked_revisions="$(node --input-type=module -e 'import {applicationExecutionRevisions} from "./packages/contracts/dist/index.js";console.log(applicationExecutionRevisions.join("\n"))')"
[[ -n "$checked_revisions" ]] || { echo "No reviewed Application sources enumerated." >&2; exit 1; }
expected_sources=6
enumerated_sources=0
seen_revisions=" "
while IFS= read -r revision; do
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid Application source enumeration." >&2; exit 1; }
  case "$seen_revisions" in *" $revision "*) echo "Duplicate Application source enumeration." >&2; exit 1 ;; esac
  seen_revisions="$seen_revisions$revision "
  enumerated_sources=$((enumerated_sources + 1))
done <<< "$checked_revisions"
[[ "$enumerated_sources" -eq "$expected_sources" ]] || { echo "Incomplete reviewed Application source enumeration." >&2; exit 1; }
verified_sources=0
while IFS= read -r revision; do
  # No runtime/build fetch: missing reviewed Git objects fail explicitly.
  node scripts/prepare-application-project-contract.ts "$work_dir/$revision" "$revision"
  source_root="$work_dir/$revision/src/application"
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$work_dir/mirror.tfrc" TF_IN_AUTOMATION=true TF_INPUT=0 \
    "$tofu_bin" -chdir="$source_root" init -backend=false -input=false -lockfile=readonly -no-color
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$work_dir/mirror.tfrc" TF_IN_AUTOMATION=true TF_INPUT=0 \
    "$tofu_bin" -chdir="$source_root" test -filter=tests/compiled-projects.tftest.hcl -no-color
  verified_sources=$((verified_sources + 1))
  printf 'SOURCE_CONTRACT_PASSED %s\n' "$revision"
done <<< "$checked_revisions"
[[ "$verified_sources" -eq "$expected_sources" ]] || { echo "Incomplete Application source verification." >&2; exit 1; }
