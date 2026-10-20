# OpenTofu in GitHub Actions

[English](README.md) | [Deutsch](README.de.md)

The central [workflow overview](../../../docs/workflows.md) describes all
pipelines, automatic and manual triggers, inputs and starting them in the
GitHub UI. This page expands on operator and approval contracts.

Executable deployments are defined directly in the workflows:

- [Configurator Bootstrap](../../../.github/workflows/configurator-bootstrap.yml): `bootstrap` or `backend`.
- [Configurator Platform](../../../.github/workflows/configurator-platform.yml): `platform`.
- [Configurator Runtime](../../../.github/workflows/configurator-runtime.yml): `runtime`.
- [Configurator Release](../../../.github/workflows/configurator-release.yml): deliver the built Web/API package with direct `cf` commands.
- [Validation](../../../.github/workflows/validate-configurator.yml): formatting, validation and mock tests for all six roots without cloud credentials.

Each deployment job shows the individual steps: credential preparation, reading previous backend outputs if applicable, `tofu init`, `tofu validate`, `tofu plan` or `tofu apply`. There is no custom JavaScript deployment runner. One-time recovery operations do not belong in this normal process.

<a id="plan-und-apply"></a>

## Plan and Apply

Plan and Apply are separate jobs. The Plan is saved with `-out` and encrypted by the native OpenTofu configuration. Apply downloads exactly the Plan artifact from the same run. After reviewing the Plan, approval is granted in the protected GitHub Environment. A small integrity check binds the artifact to its hash, commit, repository, run, root, inputs and IaC files; Plans are valid for at most 24 hours. OpenTofu additionally checks whether state has changed since planning. Re-runs are blocked: start a new run with a fresh Plan.

The central commands are visible in the workflow, for example:

```sh
tofu -chdir="infra/$LZC_ROOT" init -input=false -lockfile=readonly -backend-config="$LZC_PRIVATE/$LZC_ROOT.backend.hcl"
tofu -chdir="infra/$LZC_ROOT" validate -no-color
tofu -chdir=infra/platform plan -input=false -no-color -var-file=../environments/lzc-dev.tfvars.json -out="$LZC_PLAN"
timeout --foreground --signal=INT --kill-after=10m 70m \
  tofu -chdir=infra/platform apply -input=false -no-color "$LZC_PLAN"
```

The workflows contain all required environment variables, preparation steps and options. These excerpts are not instructions for a parallel local Apply.

<a id="logs-und-secrets"></a>

### Dev release without live Assistant qualification

During Model Serving outages, select
**release_mode=dev-skip-assistant-qualification** in
**Actions > Configurator Release > Run workflow**, branch **main**.
Leave **build_only** unchecked and **release_run_id** empty; set
**runner_pool_size=1**. Review the exact source/run and approve the existing
**lzc-dev-release** environment after all applicable build/publication checks.
This explicit Dev exception skips only the live Assistant qualification job.
`LZC_ASSISTANT_ENABLED` continues to use the existing environment setting;
the Assistant remains enabled when configured, without a new live qualification
receipt for this release. Model availability still determines whether inference
works. This is not a successful qualification and does not erase earlier failed
receipts. All non-Assistant checks, migrations, protected tags and Dev destination
guards remain in force. Conversations and proposals are preserved; existing
runtime validation, authorization and revision checks remain unchanged. No
production deployment or customer infrastructure Apply is authorized by this mode.

The manifest records Dev-only scope and `assistantQualified=false`; the build
job is named `build-dev-skip-assistant-qualification`. These artifacts cannot be
promoted using `release_run_id`, including as a qualified release. A deployment
failure requires inspection and a fresh manual run. `build_only=true` may build
this mode for inspection, but its artifact cannot subsequently be promoted.
A qualified release still requires a fresh **release_mode=qualified** run with
the complete source-bound live qualification. The default **qualified** path
and its promotion requirements are unchanged.


## Logs and secrets

Normal OpenTofu output appears live in the respective step: resource changes, progress, warnings and errors. OpenTofu masks `sensitive` attributes/outputs; preparation additionally registers the supplied backend credentials and encryption keys with GitHub's `add-mask`. No `TF_LOG=DEBUG` or shell `set -x` for deployment secrets.

`tofu output -json` and state output can contain sensitive values. Therefore, only these outputs are redirected directly into private files under `$RUNNER_TEMP/lzc-private`, with `umask 077`. They are not uploaded as plaintext artifacts. Credential preparation itself runs no OpenTofu commands. Temporary files are removed at the end of the job.

Sources: [OpenTofu sensitive outputs](https://opentofu.org/docs/language/values/outputs/#sensitive--suppressing-values-in-cli-output), [GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html).

<a id="kleine-hilfsprogramme"></a>

## Small utilities

| File | Limited responsibility |
| --- | --- |
| `prepare.mjs` | Prepare private credential/backend files and environment variables; check existing workload outputs/versioning. No process execution. |
| `prepare-release.mjs` | Prepare private backend configuration and allowed app variables for CF. No process execution. |
| `buildpack-source.mjs` | Create the protected, SHA-bound buildpack tag in the isolated release job; verify read-only during deployment. No tag updates or deletions. |
| `review.mjs` | Add a manifest to the encrypted Plan or check it before Apply. No process execution. |
| `protect-state.mjs`, `artifact.mjs` | Encrypt already captured state files for recovery. No process execution. |
| `context.mjs` | Check inputs, workflow identity and Plan binding. |
| `configure-github.mjs` | Separate operator tool for environment rules and explicitly authorized secret transfers. Not part of a deployment. |

<a id="backend--und-schlüsseltrennung"></a>

## Backend and key separation

Bootstrap and backend use the management bucket. The platform job first initializes these two roots and reads their outputs privately. Only after checking bucket versioning does it switch to the workload S3 credentials for its own state. Each root retains its separate state encryption key. Seed keys are not passed to these deployment jobs.

| Environment | Purpose |
| --- | --- |
| `lzc-dev-bootstrap-plan` / `lzc-dev-bootstrap-apply` | Bootstrap/backend Plan and Apply requiring approval |
| `lzc-dev-platform-plan` / `lzc-dev-platform-apply` | Platform Plan and Apply requiring approval |
| `lzc-dev-runtime-plan` / `lzc-dev-runtime-apply` | Space, roles and runtime users |
| `lzc-dev-release` | CF release; workload S3 access and platform/runtime state keys, no project service account |
| `lzc-dev-recovery` | Separately protected seed recovery secrets, no automatic recovery job |
| `assistant-tests` | Only the dedicated Model Serving test token; no cloud, state or execution credentials |

Configuration is in `github-environments.json`, `github-platform-environments.json`, `github-runtime-environments.json` and `github-release-environments.json`. Changes to secret destinations or key transfers require the corresponding user authorization. The operator tool is `node infra/ci/configure-github.mjs`, or with `--platform`, `--runtime` or `--release` for the respective environments.

For Assistant qualification, `github-assistant-environments.json` manages only `assistant-tests`, restricted to `main` and `feature/landing-zone-configurator`. After the approved platform Apply, `node infra/ci/configure-github.mjs --assistant` reads the new test token from the private, unchanged encrypted recovery file `.local/assistant-test-platform-state.enc.json` and transfers only `LZC_MODEL_SERVING_TOKEN` through stdin to `gh secret set`. Use Node.js 24.21.0; this mode requires neither seed access nor an OpenTofu subprocess. The file comes from the recovery backup of the successful Apply and is decrypted exclusively in memory; existing native state snapshots remain unchanged. Token values appear neither in the terminal nor in Git; general STACKIT credentials and state keys are not transferred to the test environment. The environment requires no manual test approval but allows no other branches or tags.

<a id="manuelle-ausloesung-und-serialisierung"></a>

## Manual triggering and serialization

All mutating Configurator workflows use `concurrency.group: configurator-lzc-dev-mutation` and `cancel-in-progress: false`, including Plan and approval wait time. Native S3 locks failed the integration test; `backend-safety.json` records this finding. Local remote Applies and concurrent writes outside this CI group remain excluded under the agreed operating model. Direct CLI calls by credential holders cannot be prevented by a local wrapper or GitHub concurrency.

Pushes and pull requests start no infrastructure Plans or deployments.
Bootstrap, Platform and Runtime are started exclusively through `workflow_dispatch`
from `main`; Apply additionally requires `apply=true` and
environment approval. For the backend root, select `root=backend`.
The `LZC_PLATFORM_CI_ENABLED`/`LZC_RUNTIME_CI_ENABLED` switches remain additional
operator gates but do not replace manual triggering. Old commit SHA
approval variables for feature pushes are no longer evaluated.
Application release is also exclusively manual; a merge does not
trigger it. The existing workflows concern the development environment,
not a new production environment.

In `qualified` mode, after successful Assistant qualification and build, the
isolated release job `publish_buildpack` publishes the missing buildpack tag.
This also applies to `build_only=true`, as long as the qualified commit is still
branch HEAD; a build-only run still performs no deployment.
Only this job has `contents: write`; it has no cloud environment and
no cloud credentials. This write-capable job is skipped
during artifact promotion. The deployment job rechecks the successful
qualification/build jobs and requires the already existing, exactly
SHA-bound and immutably protected tag.
It remains read-only and checks the tag before reading deployment credentials.
GitHub may additionally require `workflows: write` for tagging historical
commits; this permission is unavailable for `GITHUB_TOKEN`.
If an older qualified build lacks the tag, an explicitly
authorized operator backfill is required: first validate the source with
`release-artifact.mjs source`, then run `buildpack-source.mjs publish`
with exactly that revision and operator authentication.
Never store the operator token in CI or weaken tag protection.
A failed deployment does not invalidate a previously
successfully qualified build: a new manual run can
adopt it using `release_run_id` as long as the artifact has not expired.

The existing Plan service account role is not read-only. Therefore, these workflows may execute only trusted code; they are not intended for external pull requests.

<a id="timeouts-und-state-sicherung"></a>

## Timeouts and state backup

The limit is set directly on each `tofu` command and uses GNU `timeout`:

| Step | Graceful termination after | Time until SIGKILL | Outer job limit |
| --- | --- | --- | --- |
| Plan | 15 minutes | Another 2 minutes | 30 minutes |
| Bootstrap/backend Apply | 20 minutes | Another 5 minutes | 45 minutes |
| Platform Apply | 70 minutes | Another 10 minutes | 100 minutes |

A timeout first sends `SIGINT` so OpenTofu can stop providers and persist state. The exit code remains an error even if the process subsequently ends gracefully. A permanently blocked process can be forcibly terminated after the additional wait. Short init steps have their own limits; snapshot and upload occur outside the Apply command and before the outer job limit.

After an Apply has started, an `always()` step explicitly attempts `tofu state pull`. `protect-state.mjs` encrypts this snapshot and any existing `errored.tfstate` using AES-256-GCM and a key derived through scrypt from the respective state key. The format contains `salt`, `nonce`, `tag` and `data` as Base64; state may additionally be OpenTofu-encrypted. Only these protected files are retained for seven days as recovery artifacts. Plan artifacts are retained for one day. Abrupt Runner loss may still require manual recovery.

<a id="betriebsnachweise"></a>

## Operational evidence

This CI adjustment neither replaces nor migrates existing infrastructure.
Historical recovery inventories are not pipeline inputs and
belong in private operations documentation. The current state and
recovery contracts are defined in [architecture](../../docs/architecture.md) and
[platform operational status](../../docs/platform-readiness.md).

<a id="runtime-und-release"></a>

## Runtime and release

The runtime root reads existing platform outputs and manages the CF space,
the explicitly required `organization_user` membership before `space_developer`,
and separate PostgreSQL/Secrets runtime users. Its encrypted state
resides in the workload bucket. The first partial Apply was saved normally; a
fresh Plan added the missing CF roles without duplicates or recovery imports.

`LZC_RUNTIME_CI_ENABLED` and `LZC_RELEASE_CI_ENABLED` enable the corresponding
workflows. The user authorization of 2026-09-30 covers necessary Configurator
deployment Applies until MVP; scope/Plan review and environment approvals remain.
The release workflow builds without cloud secrets, downloads a package from the same run and
checks its SHA-256. Only the protected deploy job reads credentials. Normal
`cf push`/task logs remain visible; environment values are masked. API access
remains blocked until login is implemented. [Release details](../../deploy/cloud-foundry/README.md).
