#!/usr/bin/env bash
# Exact source/lock; mock platform plans and a loopback-only real Vault probe.
set -euo pipefail
umask 077
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$app_dir/../.." && pwd)"
runner_root="${LZC_TEST_RUNNER_ROOT:?Set LZC_TEST_RUNNER_ROOT to an immutable runner package}"
case "$runner_root" in /*) ;; *) echo 'Absolute runner package path required.' >&2; exit 1 ;; esac
tofu_bin="$runner_root/tools/tofu"
"$tofu_bin" version -json | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; if (JSON.parse(s).terraform_version !== "1.12.6") throw new Error("Pinned engine required");'
work_dir="$repo_dir/.native-initial-plan-$$"
mkdir -m 700 "$work_dir"
trap 'rm -rf "$work_dir"' EXIT
mkdir "$work_dir/root" "$work_dir/sockets"
accelerator_commit="$(cd "$app_dir" && node --input-type=module - "$runner_root" <<'NODE'
import { readFileSync } from "node:fs";
import { platformRunnerSourceSchema } from "./packages/contracts/dist/index.js";
import { supportedAcceleratorRevision } from "./packages/domain/dist/index.js";
try {
  process.stdout.write(platformRunnerSourceSchema.parse(JSON.parse(readFileSync(`${process.argv[2]}/platform-source.json`, "utf8"))).acceleratorCommit);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  process.stdout.write(supportedAcceleratorRevision);
}
NODE
)"
git -C "$repo_dir" archive "$accelerator_commit" src | tar -x --strip-components=1 -C "$work_dir/root"
while IFS= read -r source; do
  cmp "$source" "$runner_root/accelerator/${source#"$work_dir/root/"}"
done < <(find "$work_dir/root" -type f -name '*.tf' | sort)
while IFS= read -r source; do
  cmp "$source" "$work_dir/root/${source#"$runner_root/accelerator/"}"
done < <(find "$runner_root/accelerator" -type f -name '*.tf' | sort)
rm -rf "$work_dir/root/tests"
cmp "$app_dir/../deploy/runner/accelerator.lock.hcl" "$runner_root/accelerator/.terraform.lock.hcl"
cp "$runner_root/accelerator/.terraform.lock.hcl" "$work_dir/root/.terraform.lock.hcl"
(cd "$app_dir" && node --input-type=module - "$runner_root" "$work_dir/root" <<'NODE'
import {constants,createReadStream} from "node:fs";
import {copyFile,lstat,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {platformFirewallImage,platformRunnerSourceSchema} from "./packages/contracts/dist/index.js";
const [root,target]=process.argv.slice(2);
const metadata=platformRunnerSourceSchema.parse(JSON.parse(await readFile(`${root}/platform-source.json`,"utf8")));
if(metadata.firewallImageSha256!==platformFirewallImage.sha256) throw new Error("Verified-image capability required");
const image=`${root}/accelerator/firewall-image.qcow2`;
const info=await lstat(image);
if(!info.isFile()||info.isSymbolicLink()) throw new Error("Regular packaged firewall image required");
const hash=createHash("sha256");
for await(const chunk of createReadStream(image)) hash.update(chunk);
if(hash.digest("hex")!==platformFirewallImage.sha256) throw new Error("Packaged image checksum mismatch");
await copyFile(image,`${target}/firewall-image.qcow2`,constants.COPYFILE_FICLONE);
console.log(`Verified packaged image sha256=${platformFirewallImage.sha256} bytes=${info.size}`);
NODE
)
(cd "$app_dir" && node scripts/prepare-initial-plan-contract.ts "$work_dir/root")
printf 'provider_installation {\n filesystem_mirror {\n path = "%s/providers"\n }\n}\n' "$runner_root" > "$work_dir/runner.tfrc"
for phase in init validate test; do
  args=(-no-color)
  case "$phase" in
    init) args+=(-backend=false -input=false -lockfile=readonly) ;;
    test) args+=(-json -verbose) ;;
  esac
  env -i PATH="$PATH" TMPDIR="$work_dir/sockets" TF_CLI_CONFIG_FILE="$work_dir/runner.tfrc" TF_IN_AUTOMATION=true TF_INPUT=0 CHECKPOINT_DISABLE=1 \
    "$tofu_bin" -chdir="$work_dir/root" "$phase" "${args[@]}" > "$work_dir/$phase.log" 2>&1 || {
      if [ "$phase" = test ]; then
        node --input-type=module -e 'import {readFileSync} from "node:fs"; for (const line of readFileSync(process.argv[1],"utf8").trim().split("\n")) { const e=JSON.parse(line); if (e.type !== "test_plan") console.log(JSON.stringify(e)); }' "$work_dir/$phase.log"
      else
        cat "$work_dir/$phase.log"
      fi
      exit 1
    }
done
node "$app_dir/scripts/verify-runner-budget.mjs" "$runner_root" "$work_dir/root"
node "$app_dir/scripts/verify-initial-plan-contract.mjs" "$work_dir/test.log"
node "$app_dir/scripts/check-vault-bootstrap.mjs" "$runner_root"
node "$app_dir/scripts/check-firewall-image-plan.mjs" "$runner_root"
mkdir "$work_dir/worker"
(cd "$app_dir" && TMPDIR="$work_dir/worker" LZC_FIREWALL_IMAGE_PACKAGE="$runner_root" \
  node node_modules/vitest/vitest.mjs run tests/platform-worker.test.ts tests/local-runner.test.ts \
  -t 'uses the verified packaged image|advertises firewall plans only')
