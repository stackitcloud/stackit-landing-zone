# Contributing

Thanks for taking the time to contribute. This document describes the local setup, the conventions this repository follows, and what a pull request is expected to contain.

## Local setup

Tool versions are pinned in `mise.toml`. Install them once:

```bash
mise install
```

That provides OpenTofu, the STACKIT CLI, `terraform-docs` and `pre-commit` at the versions this repository is tested against.

Install the Git hooks:

```bash
pre-commit install
```

The hooks run `tofu fmt` and regenerate the module documentation. If a hook rewrites a file, stage the result and commit again.

The documentation hook invokes `terraform-docs` through `mise exec`, so it picks up the version pinned in `mise.toml` and also works when Git is started from an editor that does not have the mise environment loaded.

Deploying against a real STACKIT organization additionally requires a service account key. `mise.toml` expects it at `~/.stackit/credentials.json`; see [docs/getting-started.md](docs/getting-started.md).

## Before you open a pull request

```bash
cd src
tofu fmt -recursive
tofu init -backend=false
tofu validate
tofu test
```

`tofu test` runs the configuration suites in `src/tests/` as offline, plan-only
runs with mocked providers. These tests create no cloud resources. Real cloud
verification is a separate, manually initiated workflow, not an ordinary PR check.

## Conventions

### Changes that cross the Accelerator and Configurator

The Accelerator remains independently usable. Configurator features often span
several components; update the complete contract, not only a visible UI field.
Read the [development map](landing-zone-configurator/docs/development.md) and
[architecture](landing-zone-configurator/docs/architecture.md) first.

1. **Native infrastructure:** add or change the root/module inputs and outputs,
   defaults, validation and module tests in `src/`. Preserve state addresses and
   compatibility, or explicitly document the migration.
2. **Input/catalogue adapter:** update HCL import/export and regenerate the
   reviewed native input and template catalogues using the existing
   [adapter commands](landing-zone-configurator/tools/hcl-adapter/README.md).
3. **Domain/compiler:** wire native fields, optional/null/default semantics,
   preservation and deterministic validation in `app/packages/domain`.
4. **API/contracts:** update shared request/job contracts and server-side tenant,
   authorization, revision and lifecycle checks. Do not trust browser-only guards.
5. **Frontend:** expose the same contract, both locales, helpful validation and
   explicit review/acceptance. Test desktop/mobile and preservation of drafts.
6. **Runner/release:** carry changed inputs and outputs through broker, state,
   migrations, pinned packages and job results. Keep API/UI and Runner source
   provenance aligned; never execute an arbitrary repository head.
7. **Assistant:** review topic ownership, curated facts, permissions and proposal
   schemas. Regenerate knowledge/coverage, add factual positive and negative
   oracle tests, then qualify affected real-model cases at least twice.
   A new capability or broad contract change also needs the complete repeated
   suite and continuous journey. Do not weaken an oracle to hide a real failure.
8. **Documentation:** update user-visible behavior, architecture and contributor
   guidance. Link follow-up issues for deliberate limits.

For Configurator setup, use Node **24.21.0**, npm **11.19.0** and its own lockfile:

```sh
cd landing-zone-configurator/app
npm ci
npm run check
```

Use the smallest relevant tests while iterating, then the applicable integration
checks before review:

| Change | Required evidence |
| --- | --- |
| Native inputs/templates | Module tests; adapter `go test ./...` and catalogue checks; `npm run test:common-contract` |
| Domain/API/UI | `npm run check`; relevant database and Playwright tests |
| Broker, preparations, Runner or state | Relevant worker/broker tests; `npm run test:platform-database`; packaging and state regressions |
| Assistant | `npm run assistant:generate`, generated-file formatting, `npm run assistant:check`, factual unit tests and source-bound live receipts |
| Operator CI/IaC | Relevant `node --test` guards; workflow lint; format/init/validate and mock tests for affected IaC roots |

The [application README](landing-zone-configurator/app/README.md) documents exact
generation, database, browser and live-model commands. Database/browser tests use
isolated test services. Normal PR checks must not provision customer infrastructure.
Do not share execution credentials with the inference-only `assistant-tests`
environment. Configurator provisioning and deployment remain manual; production
setup is a separate task.

The [workflow catalogue](docs/workflows.md) lists all pipelines, automatic/manual
triggers and UI start instructions. Update it when changing workflow names,
triggers, inputs or operational gates; keep deployment authorization separate
from PR approval.

### Terraform conventions

Follow the full [Terraform style guide](docs/terraform-style.md) alongside the
existing module conventions below.

**Terraform layout.** Every module keeps its `terraform` block in `terraform.tf`, its variables in `variables.tf` and its outputs in `outputs.tf`. Resource files carry a numeric prefix when reading order matters, and each group of resources is introduced by a section header box.

**Provider versions.** The root module in `src/terraform.tf` pins every provider to an exact version. Child modules under `src/modules/` declare only a minimum with `>=`. Never add an upper bound in a child module; it silently blocks the root from upgrading.

**Naming.** `snake_case` for every block label, variable, output and local. Resource names do not repeat the resource type.

**Variables and outputs.** Every variable needs a `type` and a `description`. Every output needs a `description` before its `value`.

**Comments.** A comment explains a constraint the code cannot show, such as a provider bug or an OPNsense API quirk. Anything that describes what the code does or how the architecture fits together belongs in [docs/architecture.md](docs/architecture.md).

**Documentation.** Module READMEs are generated. Do not edit the block between the `BEGIN_TF_DOCS` and `END_TF_DOCS` markers by hand; run the pre-commit hook instead.

**Example configuration.** The tfvars files in `src/config/` are documentation. Keep them on placeholder values such as `owner@example.com` and a zero UUID for the organization. Never commit an identifier from a real environment.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), with the module as the optional scope:

```
feat(connectivity): add active/passive CARP support
fix(audit-logs): add HTTPS scheme to URLs
docs: clarify firewall bootstrap steps
```

Open the pull request against `main`. Describe what changes for a consumer of the landing zone, and say which flavor you tested against. CI runs formatting, validation, TFLint and the test suites; all of them have to pass before review.
