#!/usr/bin/env bash
# Run in CI from landing-zone-configurator/app after the ordinary application build.
set -euo pipefail
runner_dir=../.local/runner
mkdir -p "$runner_dir/apps/worker" "$runner_dir/packages/contracts" "$runner_dir/tools" "$runner_dir/providers" "$runner_dir/accelerator"
cp package.json package-lock.json "$runner_dir/"
cp apps/worker/package.json "$runner_dir/apps/worker/"
cp -R apps/worker/dist "$runner_dir/apps/worker/"
cp packages/contracts/package.json "$runner_dir/packages/contracts/"
cp -R packages/contracts/dist "$runner_dir/packages/contracts/"
(cd "$runner_dir" && npm ci --omit=dev --ignore-scripts --workspace=@lzc/worker --workspace=@lzc/contracts)
cp -R ../.local/release/runtime "$runner_dir/"
cp "$(command -v tofu)" "$runner_dir/tools/tofu"
cp ../deploy/runner/run-plan.sh ../deploy/runner/runner.tfrc "$runner_dir/"
# Only this immutable upstream commit, never user-fork Terraform code.
git fetch --no-tags https://github.com/stackitcloud/stackit-landing-zone.git a256f6896d11134fdc351786f1be5eba4e56b2e2
git archive a256f6896d11134fdc351786f1be5eba4e56b2e2 src | tar -x --strip-components=1 -C "$runner_dir/accelerator"
cp ../deploy/runner/accelerator.lock.hcl "$runner_dir/accelerator/.terraform.lock.hcl"
echo "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888  $runner_dir/accelerator/.terraform.lock.hcl" | sha256sum --check
tofu -chdir="$runner_dir/accelerator" init -backend=false -input=false -lockfile=readonly -no-color
tofu -chdir="$runner_dir/accelerator" validate -no-color
tofu -chdir="$runner_dir/accelerator" providers mirror -platform=linux_amd64 "$(cd "$runner_dir/providers" && pwd)"
# Providers are installed per task from the immutable mirror; exclude build metadata/state.
rm -rf "$runner_dir/accelerator/.terraform"
test ! -e "$runner_dir/accelerator/terraform.tfstate"
test ! -e "$runner_dir/accelerator/terraform.auto.tfvars"
tar -czf ../.local/runner.tar.gz -C "$runner_dir" .
(cd ../.local && sha256sum runner.tar.gz > runner.sha256)
