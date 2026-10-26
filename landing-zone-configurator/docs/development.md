# Configurator development map

[English](development.md) | [Deutsch](development.de.md)

Start with [CONTRIBUTING](../../CONTRIBUTING.md) and the
[local application setup](../app/README.md). This page indexes technical
references; the [user guide](user-guide.md) describes product usage.

## Component contracts

| Area | Reference |
| --- | --- |
| Components, trust boundaries and diagrams | [Architecture](architecture.md) |
| Native schemas and compiler | [Common feature model](common-feature-model.md), [common editor](common-editor.md) |
| Template drafts and parameters | [Project template drafts](project-template-drafts.md), [parameters and bindings](template-parameters-and-bindings.md) |
| Authentication and organization binding | [Login](github-login.md) |
| Runner, jobs and state | [Plan execution](plan-execution.md), [Runner packaging](../deploy/runner/README.md) |
| Assistant facts, generation and qualification | [Knowledge contract](assistant-knowledge/README.md) |
| Operator IaC and encrypted state | [Infrastructure](../infra/README.md) |
| CI permissions and manual operations | [CI runbook](../infra/ci/README.md) |
| Packaging, migrations and promotion | [CF release](../deploy/cloud-foundry/README.md) |

The older [planning notes](planning.md) and
[Platform/Application design rationale](platform-application-architecture.md)
preserve design decisions, not current acceptance status or operator commands.
Use code, current contracts, tests and issue discussions for implementation state.
Historical workstation handoffs and run-specific acceptance logs are not part of
the maintained documentation.

Configuration-list reads must not overwrite a newer post-save refresh with an
older initial response or error. Keep request ordering and the captured
session-lifetime abort signal intact. The database-configuration browser flow
delays initial reads until after a successful save to exercise this ordering on
desktop and mobile, alongside reopen, revision-conflict and delete checks.
The initial guest-to-authenticated session lookup preserves the editor DOM so
it cannot detach a focused input. Actual identity/workspace changes still reset
the draft and scoped catalogue provider; never retain private catalogues across
those boundaries.

Application template drafts use the same controlled root draft, configuration binding
and saved snapshot in the configuration editor and the first Application Landing
Zones tab. Do not introduce a separate draft or implicit save when navigating
between these views. Preparation provenance must use the persisted configuration
binding ID, never the document-local `draft.id`: saves and copies assign a
separate database ID without rewriting the document. Pass that binding through
both editor paths and keep distinct IDs in fixtures. Platform binding contains execution/backend setup before
publication. Configuration editing belongs to Configurations; deployment phases
remain separate explicit actions. Keep the catalogue provider scoped to workspace
and platform capability so losing the platform role clears private catalogue data
even though the Application view remains accessible. The Platform Owner workflow
browser regression covers save, reload and progression; its Application Owner
case also checks that no private configuration reads occur.

Keep frontend navigation and the API's explicit SPA route allowlist aligned,
including workspace and deployment-phase URLs. Direct loads and reloads must
serve the compiled UI through the API, not just the development server's history
fallback. The static-serving API regression covers these paths while retaining
404 responses for unknown routes, API/auth paths and missing assets; do not
replace the allowlist with a catch-all.

## Validation versus cloud operations

Runner output uses an authenticated NDJSON stream with unchanged JSON snapshot
compatibility. Keep the shared output-event contract, worker redaction and UTF-8
byte limits, native UI-event projection and final human-readable saved Plan in
sync. Test output before process completion and before HTTP EOF, access
revocation, disconnect cleanup and desktop/mobile collapse/reconnect. Do not
replace native progress with invented percentages or expose raw machine UI,
saved-plan JSON or state. Assistant acceptance and output viewing grant no
execution permission.

The repository-wide [workflow catalogue](../../docs/workflows.md) is the central
table for all pipelines, automatic/manual triggers, reusable calls, inputs and
GitHub UI start instructions. Update it alongside workflow changes rather than
maintaining a second partial inventory here.

Source merge does not dispatch deployment. Never put customer credentials,
state, private inventories or raw Plan output in issues, chat or test artifacts.
Local model receipts qualify only their exact source and configured models;
they do not replace the protected release workflow's qualification.
