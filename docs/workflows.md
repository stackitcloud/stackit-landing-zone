# GitHub Actions workflows

[English](workflows.md) | [Deutsch](workflows.de.md)

This is the entry point for choosing and starting a pipeline. Workflow names link
directly to their **Actions** pages; **source** links show the executable definition.
The ten current repository workflows are listed below. Historical entries and
GitHub-managed workflows are [listed separately](#other-entries-in-the-actions-sidebar).

**A merge does not deploy the Configurator.** Configurator provisioning and
application releases are manual and currently target development, not production.
Starting a workflow is not the same as approving its protected deployment job.

## Which workflow do I need?

| Task | Workflow |
| --- | --- |
| Check Accelerator changes without provisioning resources | **Validate** |
| Check Configurator, catalogue, database, browser and operator-IaC changes | **Validate Configurator** |
| Test Assistant answers against the real model | **Assistant live regression** |
| Deploy a new Configurator version, including API/UI and Runner | **Configurator Release**, not Publish Release |
| Change the Configurator's own state storage, managed services or CF identities | **Configurator Bootstrap**, **Platform** or **Runtime** |
| Exercise a real Accelerator deployment and cleanup | **Verify Deployment** |
| Publish an Accelerator GitHub release after real deployment verification | **Publish Release** |
| Compare configured machine flavors with the live STACKIT catalogue | **Validate STACKIT Flavors** |

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


## Current repository workflows

**Automatic** describes repository events, not a manual click. **Reusable** means
another workflow can call it through `workflow_call`; it is not a separate UI
approval. All ten definitions expose `workflow_dispatch`, but permissions,
branch restrictions, operator switches and environment protection still apply.

| Workflow and definition | Purpose | Automatic start | Manual start in Actions | Reusable / effects |
| --- | --- | --- | --- | --- |
| [Validate](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate.yml) · [source](../.github/workflows/validate.yml) | Accelerator formatting, lint, validation and mocked configuration tests | Every PR; push to `main`. Heavy jobs run only for relevant native/tooling changes; manual dispatch forces them to run. | **Run workflow**, no inputs | No real infrastructure provisioning |
| [Validate Configurator](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate-configurator.yml) · [source](../.github/workflows/validate-configurator.yml) | HCL/catalogue freshness, app lint/build/unit tests, PostgreSQL, desktop/mobile browser tests and six mocked operator-IaC roots | PRs and pushes to `main` affecting `landing-zone-configurator/**`, `src/**` or its explicitly listed workflow files | **Run workflow**, no inputs; manually runs without the path filter | No real infrastructure provisioning or real-model qualification |
| [Validate STACKIT Flavors](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate-stackit-flavors.yml) · [source](../.github/workflows/validate-stackit-flavors.yml) | Compare configured flavors against live STACKIT SKUs | Mondays, **05:17 UTC**, on the default branch (`17 5 * * 1`); scheduled runs may be delayed by GitHub | **Run workflow**, no inputs | Reads an external catalogue; no deployment |
| [Assistant live regression](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/assistant-live.yml) · [source](../.github/workflows/assistant-live.yml) | Repeated factual cases and a continuous multi-topic dialogue using real Model Serving | None on push/PR; called by a fresh Configurator Release | **Run workflow** with topic and repetition count | Reusable by **Configurator Release**. Inference costs; no cloud Plan/Apply. Uses `assistant-tests`. |
| [Verify Deployment](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/verify-deployment.yml) · [source](../.github/workflows/verify-deployment.yml) | Real Accelerator Plan, Apply and cleanup in the configured test organization | None on push/PR; called by Publish Release | **Run workflow** with a variable-file path | Reusable by **Publish Release**. **Creates and destroys real cloud resources** using `terraform-plan`. Retains the governance folder skeleton; failed cleanup can leave resources. |
| [Publish Release](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/publish-release.yml) · [source](../.github/workflows/publish-release.yml) | Verify the Accelerator, then create a GitHub release/tag with source archives and provenance | None; not triggered by pushing a tag | **Run workflow** on `main`, with a version | Calls **Verify Deployment** first: **real cloud changes and costs**, followed by GitHub release publication. Does not deploy the Configurator. |
| [Configurator Bootstrap](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-bootstrap.yml) · [source](../.github/workflows/configurator-bootstrap.yml) | Plan the workload-state bucket/access (`bootstrap`) or its versioning (`backend`) | None | **Run workflow** on `main`; choose root and optionally Apply | Real backend/credential access for Plan; `apply=true` enables cloud changes after protected environment approval |
| [Configurator Platform](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-platform.yml) · [source](../.github/workflows/configurator-platform.yml) | Plan shared Configurator services: CF organization, database, Secrets Manager, artifact storage and model token | None | **Run workflow** on `main`; optionally Apply; requires `LZC_PLATFORM_CI_ENABLED=true` | Real backend/credential access for Plan; optional approved cloud Apply |
| [Configurator Runtime](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-runtime.yml) · [source](../.github/workflows/configurator-runtime.yml) | Plan CF space/roles and database/Secrets runtime users | None | **Run workflow** on `main`; optionally Apply; requires `LZC_RUNTIME_CI_ENABLED=true` | Real backend/credential access for Plan; optional approved cloud Apply. Does not publish application code. |
| [Configurator Release](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-release.yml) · [source](../.github/workflows/configurator-release.yml) | Qualify, build and package API/UI and Runner together, or promote an existing qualified build | None; a merge does not start it | **Run workflow** on `main`; choose build-only, new release or promotion; requires `LZC_RELEASE_CI_ENABLED=true` | Fresh `qualified` builds call **Assistant live regression** and publish a protected buildpack tag. Unless build-only, deploys development after `lzc-dev-release` approval, including migrations and runtime checks. |

The exact Configurator path filter is in the linked YAML. A skipped
Accelerator-only job on a Configurator PR is intentional, not a deployment.
Do not make a path-filtered job a globally required check without ensuring that
it reports a result for every relevant PR.

## Start a workflow in the GitHub UI

1. Open the repository's [Actions tab](https://github.com/stackitcloud/stackit-landing-zone/actions)
   or the workflow link in the table.
2. Select the workflow, then **Run workflow**. Use **main** for ordinary
   operational runs; a branch dropdown does not override job/environment guards.
3. Fill in the inputs below and start the run. A missing button can indicate
   insufficient repository permissions, disabled Actions, or a definition without
   `workflow_dispatch` on the default branch. Old sidebar entries are not proof
   that a workflow still exists.
4. Follow the new run. For a protected job, an authorized reviewer must use
   **Review deployments**, select the environment and approve it. PR merge
   approval/admin bypass does **not** approve a deployment.
5. Check the complete run, not only dispatch success or the first green job.
   An accepted dispatch can still have skipped jobs if a gate is disabled.

### Manual start and inputs

| Workflow | Inputs and prerequisites |
| --- | --- |
| Validate / Validate Configurator / Validate STACKIT Flavors | No workflow inputs |
| Assistant live regression | `topic=all` by default, or a knowledge topic ID; `repetitions=2` by default, supported range 1-3. The continuous dialogue also runs for a topic-selected qualification. The protected `assistant-tests` environment currently permits `main` and the explicitly allowed legacy Configurator feature branch. |
| Verify Deployment | `var_file=config/hub-and-spoke-firewall.tfvars` by default; must be an existing relative path below `src/`. Manual runs use the selected revision. The reusable call also accepts `ref`; that is not a dispatch input. |
| Publish Release | `version` is required. Select `main`; other branches do not pass the verification-job guard. |
| Configurator Bootstrap | `root=bootstrap` by default, or `backend`; `apply=false` by default. Apply uses `lzc-dev-bootstrap-apply`. |
| Configurator Platform | `root=platform`; `apply=false` by default. Requires the platform operator switch above; Apply uses `lzc-dev-platform-apply`. |
| Configurator Runtime | `root=runtime`; `apply=false` by default. Requires the runtime operator switch above; Apply uses `lzc-dev-runtime-apply`. |
| Configurator Release | `release_mode=qualified` and `build_only=false` by default; `release_run_id` empty means a fresh build under the selected mode. Set `build_only=true` to build without CF deployment; protected tag publication still occurs; live-model calls run in `qualified` mode. To promote an existing qualified build, leave build-only unchecked and enter its numeric run ID; the retained artifact/tag must remain valid. |

For the normal Configurator deployment: select **Configurator Release**, `main`,
choose **runner_pool_size=1** to maintain one prepared one-shot Dev Runner
(`0` disables/drains the pool; default `0`, maximum `4`, 1 GiB RAM per reserve),
leave **build_only unchecked** and **release_run_id empty**, then approve
`lzc-dev-release` when prompted. This deploys development, not a new production
environment. See the [release runbook](../landing-zone-configurator/deploy/cloud-foundry/README.md#manual-development-release-in-github)
for promotion and failure handling.

Bootstrap, Platform, Runtime and Release reject **Re-run jobs** attempts:
start a **new Run workflow** instead. Infrastructure Apply uses the reviewed
encrypted Plan from that same run, not an older run's Plan. A fresh promotion run
can reuse an existing qualified release build; do not confuse this with re-running
the original deployment. Failed qualifications remain failures.

All four mutating Configurator workflows share the
`configurator-lzc-dev-mutation` queue and do not cancel an active mutation.
Assistant model runs have their own serialized queue. Never start parallel local
cloud writes to bypass these safeguards.

### CLI equivalent

From a terminal authenticated with GitHub CLI, for example to check the Configurator:

```sh
gh workflow run validate-configurator.yml \
  --repo stackitcloud/stackit-landing-zone --ref main
```

Use the workflow filename from the **source** link to select another workflow.
Pass its inputs using `-f name=value`; this has the same effects and authorization
requirements as the UI. For example, `-f root=backend -f apply=false` selects a
Plan-only Bootstrap run. Do not put credentials, raw Plans or state in inputs.
`gh run list --repo stackitcloud/stackit-landing-zone --workflow validate-configurator.yml --limit 5`
shows recent runs; `gh run watch RUN_ID --repo stackitcloud/stackit-landing-zone`
watches one run. Dispatch success alone does not mean its jobs succeeded.

## Other entries in the Actions sidebar

GitHub retains workflow history after files are removed and also shows workflows
managed by GitHub itself. These are not additional current repository definitions.

| Sidebar entry | Where it comes from | How it starts / what to do |
| --- | --- | --- |
| [Terraform Plan](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/terraform-plan.yml) | Historical workflow; its YAML no longer exists on `main` | Not a current manual entry point. Use the current inventory above; an old run or GitHub's workflow-state label does not restore the deleted definition. |
| [Terraform Apply](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/terraform-apply.yml) | Historical workflow; its YAML no longer exists on `main` | Do not rerun historical cloud writes as a substitute for an authorized current Plan/Apply flow. No current `Run workflow` definition on `main`. |
| Copilot cloud agent | GitHub-managed agent workflow, not YAML in this repository | Starts through GitHub's Copilot agent task interface, subject to repository policy and access; not via our `workflow_dispatch` inputs |
| Dependabot Updates | GitHub-managed update jobs configured in [dependabot.yml](../.github/dependabot.yml) | Weekly on Sundays for Terraform providers and GitHub Actions; GitHub's Dependabot UI manages update checks. Resulting PRs go through normal repository validation, not automatic deployment. |

## Maintaining this catalogue

Update this page when changing a workflow's name, triggers, inputs, branch guards,
environment approvals or operational effects. Keep reusable calls distinct from
automatic push/PR triggers. Workflow YAML and the linked operator runbooks are the
source of truth; this catalogue is not deployment authorization.

Related references: [contributing](../CONTRIBUTING.md),
[Configurator development](../landing-zone-configurator/docs/development.md),
[operator CI and environment gates](../landing-zone-configurator/infra/ci/README.md).

The `Isolated recovery lab` job in **Validate Configurator** verifies a local
PostgreSQL restore and native OpenTofu 1.12.6 interruption with synthetic fixtures.
It interrupts no hosted Runner and performs no cloud Apply. See the
[lab runbook](../landing-zone-configurator/infra/recovery-lab/README.md).

The recovery lab also exercises the real OpenTofu HTTP/S3 backend code against
loopback protocol fixtures, including retained checkpoints and an orphaned-lock
block before explicit fixture-only reconciliation. This remains local evidence.
