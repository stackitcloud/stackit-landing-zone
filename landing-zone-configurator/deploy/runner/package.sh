#!/usr/bin/env bash
# Run in CI from landing-zone-configurator/app after the ordinary application build.
set -euo pipefail
tofu_bin=${LZC_PACKAGE_TOFU_BIN:-$(command -v tofu)}
"$tofu_bin" version -json | node --input-type=module -e 'let input=""; for await (const chunk of process.stdin) input+=chunk; if (JSON.parse(input).terraform_version !== "1.12.6") throw new Error("Runner package requires OpenTofu 1.12.6");'
if [[ "${LZC_PACKAGE_APPLICATION_ROOT:-false}" == "true" ]]; then
	test "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" || test "${LZC_HOSTED_EXECUTION_PACKAGE:-false}" == "true"
fi
if [[ "${LZC_PACKAGE_PLATFORM_UPGRADE_ROOT:-false}" == "true" ]]; then
	test "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" || test "${LZC_HOSTED_EXECUTION_PACKAGE:-false}" == "true"
fi
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
cp "$tofu_bin" "$runner_dir/tools/tofu"
cp ../deploy/runner/run-plan.sh ../deploy/runner/runner.tfrc "$runner_dir/"
platform_commit=a256f6896d11134fdc351786f1be5eba4e56b2e2
if [[ "${LZC_PACKAGE_PLATFORM_UPGRADE_ROOT:-false}" == "true" ]]; then
	platform_commit=c4b43c36af198985980b17626c48d357795e3fbd
	node --input-type=module -e 'import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1], JSON.stringify({schemaVersion:1,acceleratorCommit:process.argv[2]}), {flag:"wx",mode:0o600})' "$runner_dir/platform-source.json" "$platform_commit"
else
	git fetch --no-tags https://github.com/stackitcloud/stackit-landing-zone.git "$platform_commit"
fi
if [[ "${LZC_HOSTED_EXECUTION_PACKAGE:-false}" == "true" && "${LZC_PACKAGE_PLATFORM_UPGRADE_ROOT:-false}" == "true" ]]; then
	git fetch --no-tags https://github.com/stackitcloud/stackit-landing-zone.git "$platform_commit"
fi
git -C "$(git rev-parse --show-toplevel)" archive "$platform_commit" src | tar -x --strip-components=1 -C "$runner_dir/accelerator"
cp ../deploy/runner/accelerator.lock.hcl "$runner_dir/accelerator/.terraform.lock.hcl"
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; if (createHash("sha256").update(readFileSync(process.argv[1])).digest("hex") !== "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888") process.exit(1)' "$runner_dir/accelerator/.terraform.lock.hcl"
"$tofu_bin" -chdir="$runner_dir/accelerator" init -backend=false -input=false -lockfile=readonly -no-color
"$tofu_bin" -chdir="$runner_dir/accelerator" validate -no-color
"$tofu_bin" -chdir="$runner_dir/accelerator" providers mirror -platform="$provider_platform" "$(cd "$runner_dir/providers" && pwd)"
# Providers are installed per task from the immutable mirror; exclude build metadata/state.
rm -rf "$runner_dir/accelerator/.terraform"
test ! -e "$runner_dir/accelerator/terraform.tfstate"
test ! -e "$runner_dir/accelerator/terraform.auto.tfvars"
test -z "$(find "$runner_dir/accelerator" -type f \( -name '*.tfstate' -o -name '*.tfstate.*' -o -name '.terraform.tfstate.lock.info' -o -name '*.tfplan' -o -name 'plan.bin' -o -name 'saved-plan.bin' -o -name 'credential.json' -o -name '*.log' \) -print -quit)"
if [[ "${LZC_PACKAGE_APPLICATION_ROOT:-false}" == "true" ]]; then
	mkdir -p "$runner_dir/application-src"
	application_commit=57ad1f6a651c1787694b74ff8aa8b241a3dcd16f
	if [[ "${LZC_HOSTED_EXECUTION_PACKAGE:-false}" == "true" ]]; then
		git fetch --no-tags https://github.com/stackitcloud/stackit-landing-zone.git "$application_commit"
	fi
	node --input-type=module -e 'import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1], JSON.stringify({schemaVersion:1,acceleratorCommit:process.argv[2],maintenanceEnabled:true}), {flag:"wx",mode:0o600})' "$runner_dir/application-source.json" "$application_commit"
	git -C "$(git rev-parse --show-toplevel)" archive "$application_commit" src/application src/modules/landing-zone | tar -x --strip-components=1 -C "$runner_dir/application-src"
	cp ../deploy/runner/application.lock.hcl "$runner_dir/application-src/application/.terraform.lock.hcl"
	node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; if (createHash("sha256").update(readFileSync(process.argv[1])).digest("hex") !== "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5") process.exit(1)' "$runner_dir/application-src/application/.terraform.lock.hcl"
	"$tofu_bin" -chdir="$runner_dir/application-src/application" init -backend=false -input=false -lockfile=readonly -no-color
	"$tofu_bin" -chdir="$runner_dir/application-src/application" validate -no-color
	"$tofu_bin" -chdir="$runner_dir/application-src/application" providers mirror -platform="$provider_platform" "$(cd "$runner_dir/providers" && pwd)"
	rm -rf "$runner_dir/application-src/application/.terraform"
	test -z "$(find "$runner_dir/application-src" -type f \( -name '*.tfstate' -o -name '*.tfstate.*' -o -name '.terraform.tfstate.lock.info' -o -name '*.tfplan' -o -name 'plan.bin' -o -name 'saved-plan.bin' -o -name 'credential.json' -o -name '*.log' -o -name 'terraform.auto.tfvars' -o -name 'terraform.auto.tfvars.json' \) -print -quit)"
fi
if [[ "${LZC_LOCAL_RUNNER_PACKAGE:-false}" == "true" ]]; then
	tar -czf "$runner_dir.tar.gz" -C "$runner_dir" .
	shasum -a 256 "$runner_dir.tar.gz" > "$runner_dir.sha256"
else
	tar -czf ../.local/runner.tar.gz -C "$runner_dir" .
	(cd ../.local && sha256sum runner.tar.gz > runner.sha256)
fi
