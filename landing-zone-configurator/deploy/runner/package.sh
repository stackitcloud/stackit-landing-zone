#!/usr/bin/env bash
# Run in CI from landing-zone-configurator/app after the ordinary application build.
set -euo pipefail
runner_dir=../.local/runner
provider_platform=linux_amd64
if [[ "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" ]]; then
	runner_dir=${LZC_RUNNER_PACKAGE_DIR:-../.local/runner-local}
	test ! -e "$runner_dir"
	case "$(uname -s):$(uname -m)" in
		Darwin:arm64) provider_platform=darwin_arm64 ;;
		Darwin:x86_64) provider_platform=darwin_amd64 ;;
		Linux:x86_64) provider_platform=linux_amd64 ;;
		Linux:aarch64) provider_platform=linux_arm64 ;;
		*) exit 1 ;;
	esac
fi
mkdir -p "$runner_dir/apps/worker" "$runner_dir/packages/contracts" "$runner_dir/tools" "$runner_dir/providers" "$runner_dir/accelerator"
chmod 700 "$runner_dir"
cp package.json package-lock.json "$runner_dir/"
cp apps/worker/package.json "$runner_dir/apps/worker/"
cp -R apps/worker/dist "$runner_dir/apps/worker/"
cp packages/contracts/package.json "$runner_dir/packages/contracts/"
cp -R packages/contracts/dist "$runner_dir/packages/contracts/"
(cd "$runner_dir" && npm ci --omit=dev --ignore-scripts --workspace=@lzc/worker --workspace=@lzc/contracts)
if [[ "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" ]]; then
	mkdir -p "$runner_dir/runtime/bin"
	cp "$(node -p 'process.execPath')" "$runner_dir/runtime/bin/node"
else
	cp -R ../.local/release/runtime "$runner_dir/"
fi
cp "$(command -v tofu)" "$runner_dir/tools/tofu"
cp ../deploy/runner/run-plan.sh ../deploy/runner/runner.tfrc "$runner_dir/"
# Only this immutable upstream commit, never user-fork Terraform code.
git fetch --no-tags https://github.com/stackitcloud/stackit-landing-zone.git a256f6896d11134fdc351786f1be5eba4e56b2e2
git -C "$(git rev-parse --show-toplevel)" archive a256f6896d11134fdc351786f1be5eba4e56b2e2 src | tar -x --strip-components=1 -C "$runner_dir/accelerator"
cp ../deploy/runner/accelerator.lock.hcl "$runner_dir/accelerator/.terraform.lock.hcl"
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; if (createHash("sha256").update(readFileSync(process.argv[1])).digest("hex") !== "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888") process.exit(1)' "$runner_dir/accelerator/.terraform.lock.hcl"
tofu -chdir="$runner_dir/accelerator" init -backend=false -input=false -lockfile=readonly -no-color
tofu -chdir="$runner_dir/accelerator" validate -no-color
tofu -chdir="$runner_dir/accelerator" providers mirror -platform="$provider_platform" "$(cd "$runner_dir/providers" && pwd)"
# Providers are installed per task from the immutable mirror; exclude build metadata/state.
rm -rf "$runner_dir/accelerator/.terraform"
test ! -e "$runner_dir/accelerator/terraform.tfstate"
test ! -e "$runner_dir/accelerator/terraform.auto.tfvars"
test -z "$(find "$runner_dir/accelerator" -type f \( -name '*.tfstate' -o -name '*.tfstate.*' -o -name '.terraform.tfstate.lock.info' -o -name '*.tfplan' -o -name 'plan.bin' -o -name 'saved-plan.bin' -o -name 'credential.json' -o -name '*.log' \) -print -quit)"
if [[ "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" ]]; then
	tar -czf "$runner_dir.tar.gz" -C "$runner_dir" .
	shasum -a 256 "$runner_dir.tar.gz" > "$runner_dir.sha256"
else
	tar -czf ../.local/runner.tar.gz -C "$runner_dir" .
	(cd ../.local && sha256sum runner.tar.gz > runner.sha256)
fi
