# Configurator infrastructure

[English](README.md) | [Deutsch](README.de.md)

<a id="configurator-infrastruktur"></a>

All Configurator services are managed through OpenTofu. The infrastructure remains separate from the actual Landing Zone Accelerator. OpenTofu **1.12.6** and provider versions are pinned; each executable root has a versioned lockfile.

<a id="roots-und-reihenfolge"></a>

## Roots and order

| Root | Purpose | State |
| --- | --- | --- |
| `seed` | Management bucket and its S3 access | Locally encrypted, with encrypted remote backup |
| `seed-protection` | Management bucket versioning | Locally encrypted, with encrypted remote backup |
| `bootstrap` | Workload state bucket and its S3 access | Management bucket |
| `backend` | Workload state bucket versioning | Management bucket |
| `platform` | CF organization/manager, PostgreSQL/database/migration user, Secrets Manager/provisioning user, artifact bucket and Model Serving token | Workload bucket |
| `runtime` | CF space, organization/space roles, PostgreSQL/Secrets runtime users | Workload bucket, separate key |

Bootstrap, backend, platform and runtime are provisioned in `lzc-dev/eu01`. The platform contains nine managed resources; the [operational status](../docs/platform-readiness.md) documents acceptance and outstanding connectivity work.

The STACKIT provider enables Object Storage and Model Serving when the first resource is created. For bucket versioning, the AWS provider addresses only the STACKIT S3 API; no AWS resources are created.

The platform manages separate Model Serving tokens for the application and synthetic Assistant tests. The sensitive output `assistant_test_model_serving_token` belongs exclusively in the GitHub Environment `assistant-tests`, not in the CF application binding. Both tokens have a lifetime of 90 days; deliberate rotation through `credential_generation` then requires updating the respective binding or CI secret. Adding the test token does not change the existing application token.

<a id="deployment-direkte-opentofu-schritte-in-ci"></a>

## Deployment: direct OpenTofu steps in CI

The [bootstrap workflow](../../.github/workflows/configurator-bootstrap.yml), [platform workflow](../../.github/workflows/configurator-platform.yml) and [runtime workflow](../../.github/workflows/configurator-runtime.yml) execute `tofu init`, `validate`, `plan` and `apply` directly. Normal CLI output is visible live. Small utilities prepare credentials, check the saved Plan artifact and encrypt recovery snapshots; they do not execute deployments.

[CI operations guide](ci/README.md): environments, Plan approval, timeouts, state backup and feature-branch tests. Remote Applies exclusively through jointly serialized CI; no parallel local Applies. S3 locking failed the integration test and is not claimed as working protection.

<a id="lokal-validieren-ohne-cloud-zugriff"></a>

## Validate locally without cloud access

OpenTofu 1.12.6 and Node.js 24.21.0 are required for environment preparation only. From `landing-zone-configurator/`, using `platform` as an example:

```sh
node infra/prepare-local.mjs platform --validation
(
  . .local/validation/platform/environment.sh
  tofu -chdir=infra/platform init -backend=false -lockfile=readonly -input=false
  tofu -chdir=infra/platform validate -no-color
  tofu -chdir=infra/platform test -no-color
)
tofu -chdir=infra fmt -check -recursive
node --test infra/prepare-local.test.mjs infra/plan-guard.test.mjs infra/state-key.test.mjs infra/ci/*.test.mjs
```

Preparation creates only a private environment file and a local test key. It runs no OpenTofu command. The test environment resides separately under `.local/validation/<root>` and uses no production backend keys. For other roots, replace `platform` with the respective name. Tests use mock providers. CI makes the same OpenTofu calls directly with temporary test keys.

<a id="seltene-lokale-seed-operationen"></a>

## Rare local seed operations

The management seed already exists. The following commands are the documented operating procedure for deliberately planned seed changes, not a necessary step before an app deployment. Only one operator works on the seed. Check independent key backups before making changes.

Inputs remain in the ignored files `landing-zone-configurator.env` and `landing-zone-configurator-credentials.json` in the repository root. The env file uses `NAME=WERT`: `PROJECT_ID`, `REGION`, `NAME_PREFIX`, `STATE_CREDENTIAL_EXPIRATION`. Never add credentials and state keys to Git.

```sh
node infra/prepare-local.mjs seed
(
  . .local/seed/environment.sh
  tofu -chdir=infra/seed init -lockfile=readonly -backend-config=../../.local/seed/backend.hcl
  tofu -chdir=infra/seed plan -out=../../.local/seed/review.tfplan
  # Erst nach Prüfung des konkreten Plans:
  tofu -chdir=infra/seed apply ../../.local/seed/review.tfplan
  umask 077
  tofu -chdir=infra/seed output -json > .local/seed/outputs.json
)
node infra/prepare-local.mjs seed-protection
(
  . .local/seed-protection/environment.sh
  tofu -chdir=infra/seed-protection init -lockfile=readonly -backend-config=../../.local/seed-protection/backend.hcl
  tofu -chdir=infra/seed-protection plan -out=../../.local/seed-protection/review.tfplan
  # Erst nach Prüfung des konkreten Plans:
  tofu -chdir=infra/seed-protection apply ../../.local/seed-protection/review.tfplan
)
rm -f .local/seed/outputs.json .local/seed/environment.sh .local/seed-protection/environment.sh
```

The shell files contain sensitive values, are created with mode 0600 and are excluded from Git. The environments apply only within the subshells shown. Existing keys are reused; no new key is generated when an existing workspace's key is lost. Preparation allows local cloud configuration only for the two seed roots.

<a id="recovery-und-verbleibende-arbeiten"></a>

## Recovery and remaining work

Encrypted seed backups reside in the management bucket under `recovery/seed/terraform.tfstate` and `recovery/seed-protection/terraform.tfstate`; refresh them after seed changes. Keep state keys separate and independent of the bucket. A copy in the same bucket does not protect against loss of the entire bucket.

After a failed Apply, first check CI logs, encrypted recovery artifacts and the actual resource inventory. Do not blindly repeat an old Plan or overwrite existing state. Imports and credential rotation must fit the specific incident and follow the same single-writer rule. The former automatic one-time recovery path was removed after completion.

The app and its CF environment variables are managed in the separate [release workflow](../../.github/workflows/configurator-release.yml) through the declarative [CF manifest](../deploy/cloud-foundry/manifest.yml). Connection tests from CF succeeded. Outstanding work includes the application schema/RLS, automated credential rotation and a complete, tested operations/restore process. [Planning](../docs/planning.md).


Direct CLI pipelines verified (2026-09-30): [bootstrap 36677111141](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111141) and [platform 36677111032](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111032) each show `No changes`, with visible native init/Plan logs and Apply skipped. [Validation 36677111055](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111055) also confirms the GNU timeout test on Linux. Further current acceptance results are in the [platform operational status](../docs/platform-readiness.md).
