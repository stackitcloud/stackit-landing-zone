# Repository guidance

[English](AGENTS.md) | [Deutsch](AGENTS.de.md)

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code. For Terraform,
also read and follow [the Terraform style guide](docs/terraform-style.md);
preserve the documented root/child provider-version conventions.

## Boundaries

- `src/` is the independently consumable Accelerator. Do not make it depend on
  the Configurator API, database or hosted service.
- `landing-zone-configurator/` contains its own app, contracts, compiler, HCL
  adapter, Runner packaging and operator IaC. Follow the
  [cross-component development map](landing-zone-configurator/docs/development.md).
- Keep native inputs, generated catalogues, domain validation, API/job contracts,
  frontend/locales, Runner and Assistant knowledge consistent. Generate artifacts
  using existing commands; do not hand-edit generated content.
- Preserve imported fields, stable resource identities, null/default semantics,
  tenant authorization and revision-bound approvals. Assistant acceptance is
  neither persistence nor permission to Plan/Apply.

## Verification and operations

- Use pinned tools and the smallest relevant existing checks, then validate the
  complete affected flow. Report skips and unresolved failures explicitly.
- Changes to Assistant facts or capabilities require source-bound real-model
  qualification as described in the knowledge contract. Failed repetitions are
  failures, not retries; do not weaken validation to obtain a green receipt.
- Never expose secrets, customer state, raw plans or private operational evidence.
  Do not run cloud mutations or deployments without explicit authorization.
- Configurator provisioning and application deployment are manual workflows.
  A source merge is not deployment approval; production is a separate follow-up.
- Preserve unrelated worktree changes. Update directly related public and
  contributor documentation, not dated session notes or handoff files.
- Maintain English-first documentation and German companions according to
  [CONTRIBUTING.md](CONTRIBUTING.md); preserve generated and machine-ingested
  source contracts.
