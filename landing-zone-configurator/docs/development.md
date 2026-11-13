# Configurator development map

[English](development.md) | [Deutsch](development.de.md)

Start with [CONTRIBUTING](../../CONTRIBUTING.md) and the
[local application setup](../app/README.md). This page indexes technical
references; the [user guide](user-guide.md) describes product usage.

## Component contracts

| Area | Reference |
| --- | --- |
| Notifications and transactional email | [Notifications](notifications.md), [MailOut operations](../infra/mailout/README.md) |
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

## Account and workspace boundaries

Migration `097_explicit_workspaces.sql` retires automatic personal workspaces.
An account without a selected ordinary workspace receives `workspaceRequired`
and no public tenant in the session response. Workspace data/execution APIs
reject that context server-side; workspace creation, selection and invitation
acceptance retain authentication and CSRF checks. Revocation returns the account
to workspace selection without granting fallback access to the login context.

The internal `account` tenant row is a stable, unprivileged login/encryption
context, not a listed or selectable workspace. Its UUID and the session's
immutable token binding remain intact. Empty legacy homes become account contexts;
homes with referenced data become ordinary unverified workspaces with unchanged
resource, configuration and credential IDs. Their original admins retain local
management capabilities, not verified STACKIT authority. A missing organization ID
can be assigned once by a workspace manager; normal Owner verification is still
required. Tests for workspace features must explicitly create/select a workspace.

## Interface localization

Use `t()` for interface headings, navigation, buttons, hints, accessible labels
and diagnostic messages, with English entries in `apps/web/src/locales/en.ts`.
Translate stored message identifiers and editor-step metadata when rendering so
an immediate language switch also updates already open dialogs and errors.
Translate surrounding interface text separately from customer names, entered
values, resource identifiers and Assistant-generated content; preserve those
values exactly.

`tests/i18n-coverage.test.ts` checks static message registration and untranslated
JSX or accessible labels as part of `npm run check`. Run the `i18n` and
`english-interface` Playwright flows on desktop and mobile for dynamic rendering,
language changes and preservation of customer data. Inspect their screenshots:
source coverage cannot detect every missing translation call on runtime values.

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
server-side; never extend the absolute app session or blindly extend organization-owner
proof. Bound workspaces renew the latter through separate real Resource Manager/IAM
checks, capped by the personal token, identity, app session and five-minute lifetime.
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

Assistant initial-owner aliases use email metadata only. The server joins personal stored credential profiles to preparations by current profile ID/key and the persisted configuration ID plus draft organization, under the existing tenant/user transaction. Never substitute document-local IDs, read decrypted credentials for inference or treat preparation provenance as a successful access check. Multiple distinct accounts remain a choice. Shared-owner continuations must preserve existing explicit owners, and legacy-role transitions require a fresh, reviewed confirmation rather than implicit permission reduction.

## Upgrade regression without a Dev deployment

Run `npm run test:upgrade-journey` from `app/` after installing the pinned tools,
Docker and Playwright Chromium (`npx playwright install chromium`). The command
builds the UI, creates a disposable PostgreSQL container bound to loopback,
applies all migrations and removes the container afterwards. No cloud access or
customer data is used. CI supplies its existing local test database and uses
`--no-build` after the regular build.

The browser uses the compiled SPA, real HTTP routes, PostgreSQL sessions, CSRF,
RLS and migration functions. Its fixture includes a successful historical
Plan/Apply and a consumed Plan claim, not just an empty order. It selects,
previews and saves an upgrade, reloads it, follows the next step to Plan and
checks the compiled target version, reviewed execution source and unchanged
State key. It then records a synthetic completed no-change Plan, withdraws the
unapplied target, reloads and selects a newer version with Kubernetes permissions.
The new compiled input must contain those permissions and the same State key;
the withdrawn Plan remains blocked. The journey also checks the withdrawal
route's session, origin and CSRF guards. It does not run a cloud Plan or Apply. Separate database/Runner broker
tests cover dispatch and artifact admission. Do not replace these upgrade API
responses with browser route mocks; those would hide transaction failures.

Upgrades revoke only unclaimed old Plan grants. Claimed historical grants and
claims stay immutable; consumed-claim uniqueness and current source/candidate
checks prevent their reuse. Active executions and unresolved recovery still
block the upgrade. SQL conflicts retain their explicit safe error codes; an
unknown conflict must not be reported as a State-backend mismatch.

Signed-in draft checkpoints are debounced during editing, then flushed
synchronously on `beforeunload` and `pagehide`. Capture the owner in the same
render snapshot as the draft, binding, saved baseline and location; flush only
if it still matches the active account/workspace. Explicit logout must not
resurrect a checkpoint; expiry may retain the original owner's private draft.
The Fork save/reload browser test pauses the debounce and proves the old
checkpoint still exists immediately before reload, then checks the new Platform
template and parameter policy after recovery.
