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
| Runner, jobs and state | [Plan execution](plan-execution.md), [Application execution lifecycle](application-execution-lifecycle.md), [Application template/platform updates](application-upgrades.md), [Runner packaging](../deploy/runner/README.md) |
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
Session heartbeat updates must not restore an older checkpoint over a live draft
or detach focused inputs. Expiry preserves draft, database binding/revision and
saved baseline; restoration requires the same user and workspace. Explicit logout
clears the checkpoint, including in expired tabs, but a logout from an older session
must not clear a newer login. Test delayed refresh outcomes with a new immutable
Session value and both desktop/mobile layouts. Refresh grants remain encrypted
server-side; never extend the absolute app session or organization-owner proof.
See [login behavior](github-login.md) for renewal and unavailable-storage fallback.

Application template drafts use the same controlled root draft, configuration binding
and saved snapshot across configuration editing and the first Application Landing
Zones tab. Template editing belongs exclusively to that tab; the configuration
step list omits projects for platform drafts, while legacy concrete-project editing
remains available. Old platform draft project-step routes redirect to Applications.
Guest users may edit their local templates there without publication or ordering. Do not introduce a separate draft or implicit save when navigating
between these views. Preparation provenance must use the persisted configuration
binding ID, never the document-local `draft.id`: saves and copies assign a
separate database ID without rewriting the document. Pass that binding through
both editor paths and keep distinct IDs in fixtures. Platform binding contains execution/backend setup before
publication. Configuration editing belongs to Configurations: its navigation entry resumes the
current draft in the editor; the editor breadcrumb opens the saved list. List
actions open the editor directly and ask for replacement only when a different
unsaved draft would be lost. Clean drafts reopen without confirmation; cancel
retains the draft and binding. Deployment phases remain separate explicit actions. Keep the catalogue provider scoped to workspace
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

The complete project IAM snapshot is separate from the workload default. Refresh it from the official `GET https://authorization.api.stackit.cloud/v2/permissions?resourceType=project` response with `npm run permissions:generate -- /private/project-permissions.json YYYY-MM-DD`, then format the generated file with Biome, regenerate Assistant knowledge and qualify affected real-model cases. Never guess permission identifiers. Domain parsing preserves bounded future identifiers; server publication confirms additions against the snapshot or an authenticated live catalogue, after authorization and outside the publication transaction. Requester parameters cannot override published policies. Assistant service additions are deterministic catalogue unions, preserve existing lists and owner, and require a service quote matching the current request. Full identifier lists are not sent in unrelated model prompts.
