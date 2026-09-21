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

`tofu test` runs the three flavor test suites in `src/tests/` as plan-only runs. They reach the STACKIT API for validation but create nothing.

## Conventions

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
