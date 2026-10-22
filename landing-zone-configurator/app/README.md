# Configurator development

[English](README.md) | [Deutsch](README.de.md)

<a id="configurator-entwicklung"></a>

TypeScript workspace with React/Vite, Fastify, a domain model and API contracts. Dependencies are pinned exactly, and the npm lockfile is versioned. Prerequisites: Node.js **24.21.0**, npm **11.19.0**. `../mise.toml` and `.node-version` document the runtime independently of the Accelerator.

<a id="installieren-und-prüfen"></a>

## Install and check

In the `landing-zone-configurator/app` directory:

```sh
npm ci
npm run check
```

`check` runs Biome, TypeScript checking including tests, the production build and Vitest. `npm run format` corrects formatting and import order.

If the matching runtime is not yet available locally, the following works without a global installation, for example:

```sh
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm ci
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run check
```

<a id="lokal-starten"></a>

## Start locally

<a id="automatisierte-assistant-themenpruefung"></a>

### Automated Assistant topic checks

The [test catalogue](../docs/assistant-test-catalogue.json) assigns each
editor/Accelerator field to exactly one knowledge topic: type, optionality,
ownership, actual proposal mode and allowed patch path.
Regional DNS forms, protected values and components supported only in advisory mode
are not presented as proposals that can be accepted. Workflow topics without their own
fields are also included. Missing/duplicate assignments and drift fail
`npm run assistant:check` and the normal `npm run check`.

The [synthetic chat cases](scripts/assistant-scenarios.ts) contain a fixed question for each
knowledge topic. Additional regressions check exact
foundations restoration, DNS contact priority including template placeholders,
domain/network preservation, complete SNA values and additive organization/folder roles
with saved or verified email sources. Unit tests also check that the
validators actually reject incorrect answers. New fields/topics require
review of the mapping and questions, then `npm run assistant:generate` and formatting
of the generated knowledge bundle. Regeneration alone is not domain evidence.

The overview cases for foundations, governance, firewall policy and sandboxes
additionally check concrete native field names and important boundaries, not just a
topic reference. The intent classifier recognizes pure field overviews semantically;
for these four topics, the backend knowledge contract answers directly from the
field inventory and reviewed boundaries, without a second free-form model response.
This is a separate advisory path, not a substitute for a failed
model response. Explicit role requests also have a reviewed
draft path: intent determines the role, email source and explicit folder selection;
the backend contract maps these to additive fields without a second free-form model response.
Other requests, follow-up questions and proposals continue to use the
response model. All trusted system instructions are sent in a single
system message so serving chat templates do not lose earlier contracts.
Token-limit truncations remain explicit errors (`completion_truncated`),
without automatic retries or partial acceptance. SNA proposal texts and their
streaming show only checked values and never confirm that
persistence has already occurred.

Firewall infrastructure and HA under `connectivity.firewall`/`firewalls` can be
proposed as individual draft fields. Native HA is an object with
`backup_zone`, not a checkbox/Boolean; other HA fields are individually selectable.
Existing single/map forms, area keys and unrequested values are preserved.
New appliances need name, zone, flavor and both confirmed available subnets
together; a new HA configuration needs its backup zone. Incomplete selection
is rejected without saving. Address containment, overlaps, node/VIP IPs
and distinct zones are validated. Unknown products or available
networks are not invented from project counts. Optional node/VIP IPs are limited in the
model contract to saved or user-confirmed addresses;
computed native defaults are preserved without unsolicited explicit IP changes.
For combined network/firewall
requests, a complete saved SNA is reused instead of
blanket deferral of the firewall. A /16 mathematically provides 512 /25 subnets with 128
addresses each before reservations, not 128 project networks. Regional patches, policies,
operator access, removal and execution remain outside this contract.
Field acceptance is not deployment, throughput evidence or public IP failover.
Broad firewall setup shows existing draft values and, alongside
an HA proposal, asks about the next unanswered traffic, capacity or
operational decision. Targeted individual field changes remain free of questionnaires.
Answers about traffic rules and capacity continue an ongoing firewall
setup request instead of turning it into isolated advice.
Explicitly unknown capacity remains an open sizing/benchmark item;
the still missing interruption/operational decision follows next. Already
named operators and confirmed traffic paths are not asked about again.
Rule requirements are summarized, not presented as configured rules.
Confirmations refer to actual user statements; internal
control texts are not displayed as follow-up questions.
The native Accelerator manages rules, aliases, routes and NAT through
`firewall_config`; the current chat can neither define this policy nor
accept it as a proposal. Guided editor policy editing and
Assistant rule/NAT proposals are post-MVP by user decision
([#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101)).
In the MVP, the firewall administrator maintains policy manually in OPNsense.
The common editor already has generic native fields under Operations / Firewall rules,
not qualified policy management; these are preserved.
Capability and definition requests receive the boundary explicitly,
without follow-up questions promising a rule proposal. Infrastructure/HA alone
guarantees neither isolation nor Internet access or NAT.
Explicit topic changes take precedence over old network/firewall characteristics.
"Set up audit logging next" is a current request,
not a deferral. Historical network goals are not carried into another topic as
active requirements; evidence checks remain.
Audit logging has a native telemetry link/router/logs/archive contract
and generic editor fields under Platform. Chat now uses the same
native input contract for acceptable audit, observability, federation,
VPN, DevOps, Kubernetes, project/template and namespace proposals.
Protected bindings, publication, cloud execution and firewall policy
remain separate workflows. New audit configurations require retention,
ACL and explicit Object Lock selection together; with Object Lock, the
range is 1–365 days. No setup or event delivery is claimed.

Editor proposals use `merge` for partial object/map changes,
`replace` for an atomically checked complete replacement and `default`
to remove an optional override. Lists remain atomic.
Omitted merge fields and existing resource identifiers are preserved.
Platform drafts edit project templates by stable keys;
template identifiers are created server-side, not in the model. New/removed
templates, settings and parameter rules remain local draft changes.
Field coverage and real compiler/export/identity checks are in
[assistant-editor.test.ts](tests/assistant-editor.test.ts).
Rejected model responses provide a safe error category and
diagnostic identifier, not raw responses or credentials. Configuration chat and
template advice show localized causes and next steps; the message
and answer selection are preserved. HTTP and response streams use the same
error contract. There are no automatic retries or partial acceptance.
Chat and field acceptance also work with unsaved editor changes.
Chat receives only the approved values of the current local draft.
Follow-up answers in configuration chat and template advice are sent directly with
`Send answer`, without a separate preparation step.
Existing text in the message field is sent along. On error,
text and answer selection are preserved for another attempt.
Proposals are accepted only into the local draft; saving
remains separate. A three-way comparison preserves independent local and saved
changes. Only real conflicts require explicit confirmation;
a different revision alone does not block acceptance. Older proposals without
a demonstrable original value require value review. Migration057 stores
only approved proposal baseline values, not complete drafts/secrets.
The preview changes neither configuration nor saved conversation.
Without `draft`/`savedDraft`, the API acceptance path retains its previous transactional
persistence behavior and strict revision check.

`organization_owners` and `organization_auditors`, as well as
`rm_folders[*].owner_emails`/`reader_emails`, are individually acceptable proposal fields
for explicit role requests. Known emails are used only from the
requested source; template placeholders, developer login and
service accounts do not replace verified human login. An unknown
email or unspecified folders remain follow-up questions. Existing assignments
are not removed, and name delegation does not permit role changes.
Organization owner already covers the folders; the native Accelerator avoids
duplicate folder assignments. Readers are assigned natively as `auditor`.
Acceptance saves only configuration, not STACKIT IAM or Configurator roles;
IAM changes remain bound to a reviewed Plan and separate Apply approval.

```sh
# Ohne Credentials: Inventar, Wissensfrische und Testfragen pruefen
npm run assistant:check
# Echter Modelllauf mit allen Themen; vorhandenen privaten lokalen Zugang nutzen
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials
# Nur ein Thema oder eine Regression
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials --topic dns-zones
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials --case foundations-restoration
# Zusammenhaengender Dialog mit GPT-OSS 120B fuer beide Modellrollen
LZC_MODEL_SERVING_MODEL=openai/gpt-oss-120b \
  LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b \
  npm run test:assistant:journey -- --local-credentials
```

The journey test goes through twelve steps from foundations and roles through
SNA/firewall, the policy MVP notice and audit follow-up questions to observability,
DevOps, Kubernetes and labels. Every step uses the same evolving
draft and actual conversation history. Domain-appropriate proposals
are accepted in memory, checked by JSON roundtrip and finally exported as
tfvars. Incorrect proposals are not accepted; rejected
model/application results, as in the API service, are not stored as successful
conversation responses. Model names, knowledge/journey hashes,
individual results and response times are output. This does not replace
browser, PostgreSQL or cloud execution checks. Both live runners block
enabled execution flags; they change neither the running model selection nor
customer configurations and use no automatic retries.

Both runners leave at least 2500 ms between actual serving requests,
including between intent and response in the same step. This limit
applies only to tests, not to the production Assistant. Reported
response times include the wait and therefore are not directly comparable with
measurements without this limit. Quota errors remain visible failures;
they are not hidden by automatic retries.

<a id="weitere-assistant-komponenten-ergaenzen"></a>

#### Add further Assistant components

1. First check the native input type and the manual editor/compiler path.
   The Assistant derives paths, values and required fields from the same inventory;
   no second, handwritten component structure or free-form HCL patches.
2. Add a reviewed knowledge topic with native inputs, field paths, sources and
   dependencies. Intent and follow-up questions are restricted to it.
3. Add only domain requirements beyond the native type to
   `assistantEditorPolicies`, for example explicit
   audit creation decisions and free text instead of invented ACL choices.
   Policy field paths must exist in the native inventory.
4. Check creation and updates separately: new objects use
   typed constructor slots for simple scalars and lists; optional
   null slots mean native defaults and are omitted only during creation without
   a previous value. Complex optional collections remain optional;
   for example, empty audit link scopes are not an organization default.
   Existing objects are changed partially; new map entries need native
   required fields. Replacement and default reset remain explicit, atomic operations.
5. Add tests for real acceptance, sibling preservation, identities, source binding,
   missing decisions, topic changes and DE/EN. Even a response accepted by
   serving is checked against the offered schema contract and
   then against unchanged native runtime validation.
6. After knowledge generation, first qualify targeted offline/model cases, then the serial
   journey and complete scenario run. Document hashes and remaining
   failures; no model/API rollout based only on green mocks.

Proposal texts containing changes are formulated server-side as local draft proposals,
not as model claims of persistence or permission assignment.
Firewall policy, credentials, organization binding, publication and execution
remain separate, protected workflows.

The live test uses real Assistant orchestration, intent classification,
knowledge selection, response validation and the local compiler, but only
synthetic configurations in memory. No browser, user SSO or access
to customer conversations/databases; no automatic acceptance and no cloud job.
The HTTP/session/transaction paths remain covered by unit/database tests.
The run reports each case's response, error codes, duration and finally
model/knowledge version and counts; every failure produces exit code 1. Missing access
is not skipped. Live calls incur Model Serving costs.
Topic smokes check reference, valid response contract and advisory mode, not
automatically the factual correctness of every textual statement or individual field.
A green smoke is not complete component/cloud qualification.

Without `--local-credentials`, `LZC_MODEL_SERVING_TOKEN` is expected from the process
environment. Locally, the shared secure loader reads the existing
encrypted state with the original key; private files must belong to the current
user and have no group/world permissions. Tokens/keys are
not output or written to tests/reports. No new credentials in Git,
no rotation of existing keys and no SSO automation.

The manually triggerable [GitHub workflow](../../.github/workflows/assistant-live.yml)
uses the `assistant-tests` environment. Store `LZC_MODEL_SERVING_TOKEN` there as an
environment secret with approval/branch protection; write no tokens in chat,
workflow files or command lines. Normal PR checks remain offline
and need no cloud secrets. A service account for future read-only
product catalogue tests must be set up separately with minimal permissions and a test project;
it does not replace a human identity for user/SSO permission checks.

Two terminals in the app directory:

```sh
# Terminal 1: API auf http://127.0.0.1:3000
npm run dev
```

```sh
# Terminal 2: UI auf http://127.0.0.1:5173
npm run dev:web
```

These commands can also be run with the `npm exec` prefix shown above if the local Node version differs. The Vite development server forwards `/healthz`, `/auth` and `/api` to the local API. Build shared packages before starting the UI (`npm run build:packages`, already part of `npm run dev`). Rebuild after changes to shared packages; automatic workspace watching will follow later.

<a id="ubuntu-workstation-mit-entwicklerlogin-und-https"></a>

### Ubuntu workstation with developer login and HTTPS

This separate launcher is intended for personal Ubuntu development without
a registered OIDC Web client, **not** for Cloud Foundry or production.
It accepts only a canonical HTTPS origin, enables no
STACKIT CLI callback and creates its own personal workspace.
It claims no verified STACKIT user identity and grants no
organization-related product roles. Existing workspaces, drafts and
chats are neither adopted nor changed.

```sh
npm run build
LZC_DEVELOPMENT_ORIGIN=https://work.lukas.runs.onstackit.cloud:4181 \
  LZC_RUNNER_PACKAGE_DIR=/absoluter/pfad/zum/geprueften/runner \
  npm run dev:workstation -- --execution \
  --service-account-file /absoluter/pfad/zur/privaten-service-account-key.json \
  --organization ORGANISATION_UUID
```

Without `--execution`, Plan/Apply remain disabled. With the switch,
the existing native platform Runner is available; **no** cloud job starts.
Preparation, Plan, state mapping and Apply approval retain their existing
checks. The separate application Runner remains independently disabled.
GitHub linking and SSO-dependent organization functions are unavailable
in this mode.

The initial username is `developer`. The random initial password
is available only in the private local file
`../.local/development/initial-password` (0600), not in logs or responses.
After securely transferring it to a password manager, this file may be deleted.
`../.local/development/account.json` contains the salted scrypt hash
and durable Dev principal ID; keep this file and do not check it in.
Login, logout and API mutations continue to use Secure/HttpOnly cookies,
the exact HTTPS origin, CSRF tokens and existing tenant/RLS checks.
A maximum of ten login attempts per 15 minutes and API instance applies.

`--service-account-file` accepts only a small, regular, non-linked
file owned by the current user without group/world permissions. The key is
stored idempotently as its own credential profile in the existing encrypted
secret store; no mapping to an existing user.
`--organization` checks only technical organization read access; it
is **not** evidence of human organization membership. This explicit import may
be omitted on later starts. Do not pass secrets in shell arguments.

Install Caddy for TLS delivery and start it separately:

```sh
sudo caddy run --config "$PWD/scripts/workstation.Caddyfile" --adapter caddyfile
```

The API and built UI remain on `127.0.0.1:3000`; a separate Vite preview
on port 4181 must not run in parallel. Caddy serves the application at
`https://work.lukas.runs.onstackit.cloud:4181/`. TCP 4181 must be reachable by the browser,
TCP 80 for public ACME HTTP checks and later renewals.
Port 80 serves only challenges/HTTPS redirects. For another host,
set `LZC_DEVELOPMENT_HOST` for Caddy and the corresponding `LZC_DEVELOPMENT_ORIGIN`
for the API; the HTTPS port in this Caddy example is 4181.
No self-signed certificate and no insecure HTTP login fallback.
The processes run only during the session in which they were started; no
autostart service is configured for this development setup.

Targeted checks:

```sh
npx vitest run tests/development-login.test.ts tests/auth-routes.test.ts
# Ausschliesslich isoliertes configurator_test auf einer lokalen Testdatenbank:
LZC_TEST_DATABASE_URL=postgres://.../configurator_test \
  npx vitest run integration/development-login.test.ts
npx playwright test e2e/development-login.spec.ts
```

<a id="lokaler-stackit-login"></a>

### Local STACKIT login

After explicit approval to use the CLI client, real login can be
started locally without Dev database or Secrets Manager access. Docker must be running:

```sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:login
```

The backend runs exclusively on `127.0.0.1:3000`; the associated built
UI preview must run at `http://127.0.0.1:4181`. The launcher creates its own
Docker container `lzc-local-stackit-login` with PostgreSQL 17, binds its port
only to loopback and applies the existing migrations. Random
database passwords are not output; the runtime continues to use
`configurator_app`, not the migration identity. The local database survives
an API restart; the launcher deletes no users or drafts.

STACKIT identity verification, sessions, credential profiles and product catalogues are real.
Technical STACKIT queries use the service account stored in the active tenant.
Platform Engineers can also manage credentials in organization tenants;
profiles remain bound to tenant and owner. In the personal tenant, an
accessible active reference project is determined automatically; in an organization tenant,
the search is restricted to that organization.

Only in the local launcher does AES-256-GCM storage replace Secrets Manager.
Key files are encrypted under `../.local/credential-secrets/`; the
separate local encryption secret `master.key` and the directory are accessible only
to the operating system user. This is no substitute for a production
Secrets Manager: anyone with access to the directory and encryption secret
can decrypt the data. Do not share the directory or add it to the repository.
Like the database, it survives restarts.

`dev:login` enables no Runner and adopts no Dev data. With a
prepared native package, `dev:execution` enables local platform Plans and
the Apply path requiring explicit approval. Organization Platform Engineers
continue to use private, tenant-bound preparations and credentials.
HTTP is permitted only for explicitly enabled, canonical loopback
origins; production configurations continue to require HTTPS.
A mere `vite preview` without this backend cannot perform login.

<a id="recovery-pruefbelege"></a>

### Recovery review evidence

After applying migrations 051 and 052, the separate opt-in
`LZC_APPLICATION_RECOVERY_REVIEWS_ENABLED=true` can enable recovery review evidence.
The default is disabled. On its next start, the local login launcher applies
the existing new migrations; a restart is therefore a controlled
migration step, even if native Runners remain switched off.

The action is restricted to the originally approving Platform Engineer with a current
session and valid human STACKIT identity. It records
only the explicit review of the bound diagnostic state. It changes no
job status and lifts no state/recovery block. Without the new migration,
the opt-in must remain off. When opted in, hosted startup checks the table
and the new reconciliation function from migration 052. The read-only review context shows
the stored Runner ID, report hashes, ticket window and grant/delegation revocation.
Start uncertainty, missing completion and stored recovery state remain
distinct findings. Ticket expiry or delegation revocation proves
neither Runner termination nor revocation of cloud credentials already issued.
Cloud reconciliation, Runner termination, state recovery and execution approval
remain separate operations with their own evidence and approvals.

### Application replan after failed Apply

Migration 064 adds a separate immutable completion-clearance receipt. It is
independent of the advisory review flag above. The original Application Owner
can check and clear a terminal `apply_failed` job with a consumed, package-bound
Runner ticket, bound output evidence and no recovery record. The check reads
only the exact Application S3 key using server-held backend credentials, checks
locks before and after reads, verifies `terraform_data.contract`, and returns
resource counts plus checkpoint metadata. It never returns raw State or secrets.
The five-minute encrypted review token is bound to the tenant, session, job,
backend and observed checkpoint; approval rechecks all bindings and S3 content.

This records reported command completion, not independently verified Runner or
cloud reconciliation. A fresh, normally refreshed Plan and normal Apply review
remain mandatory. Unknown final completion retains the separate original-PE
operator-attestation path with expired execution windows; State write failures,
recovery records, locks or mismatched State cannot use this path. Clearance
changes no historical dispatch or State and starts no execution. SQL enforces
the fresh-Plan boundary at saved-plan lookup and Apply insertion, and a new failed
Apply requires its own clearance. The original Accelerator pin is unchanged.

<a id="lokale-plan-apply-ausführung"></a>

### Local Plan/Apply execution

With Node 24.21.0, npm 11.19.0 and checksum-verified OpenTofu 1.12.6 in `PATH`:

```sh
npm run build
LZC_LOCAL_RUNNER_PACKAGE=true bash ../deploy/runner/package.sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:execution
```

Packaging requires a new target directory and overwrites no
existing package. `LZC_RUNNER_PACKAGE_DIR` may point to another checked package.
Native mode is intended exclusively for local development,
not as a replacement for production CF isolation. Jobs run with a minimal
environment under `~/.local/share/landing-zone-configurator/runner-jobs`, outside
the workspace; package contents and runtime are bound to the saved Plan.
After an API crash, jobs with uncertain running status are not automatically retried
or terminated through unrelated process IDs. Recovery files prevent cleanup.

The native worker creates its CLI configuration with the package mirror path and
uses a short private temporary directory for provider sockets, removed during
cleanup. Init permits provider files up to 256 MiB; other phases
retain the 64 MiB limit. The real package init/validate test stops before Plan
and uses neither customer credentials nor customer state:

```sh
LZC_NATIVE_RUNNER_TEST=true LZC_RUNNER_PACKAGE_DIR=../.local/runner-local-20261003-mirror-init npm exec -- vitest run tests/platform-worker.test.ts -t 'real native providers'
```

Under **OpenTofu output**, platform jobs also show live progress in Cloud Foundry
through an authenticated NDJSON channel. The worker reads
complete lines every 500 ms; only changed, redacted text is
saved encrypted and forwarded. Plan provides native
OpenTofu UI events before the finished diff is available; raw event objects
and their output data are not sent to the browser. **Follow output** can be paused to review older
lines. Collapsing and navigation disconnect the stream; reopening
resumes at the current capture. JSON snapshots remain compatible.
Successful platform Plans are displayed
read-only through `tofu show -no-color` from the unchanged saved
artifact, including resources and attribute changes.
OpenTofu masks sensitive values as in the CLI. The separate output route
requires a session, deployment role and private owner/tenant mapping;
raw Plan binaries or `show -json` are not delivered to the browser.
Each Plan remains bound to its immutable Runner package. A package change
requires a new Plan and its explicit approval.
Running Apply output is also updated. Before the terminal result,
the worker saves the latest redacted CLI text encrypted at the broker;
it remains readable after cleanup and reload under the same private access controls.
**Apply evidence** shows Plan ID, SHA-256, target organization, the job's state backend
and completion time. Existing exact organization confirmation and,
if applicable, destructive approval remain required; no automatic retry.
Output is limited to 2 MiB; truncation is indicated. Saving is
best-effort: hard process termination or failed upload does not guarantee a
complete historical capture. Already saved
text needs no running native Runner. During streaming,
session, tenant, role and ownership are rechecked. Connections are
closed after at most 35 seconds and reopened for an active job;
backpressure, byte limits and at most eight streams per owner/tenant and
API instance limit resources. Details: [Plan execution](../docs/plan-execution.md).

For new platforms, **Accelerator standard · Management S3** is the default.
The selected service account executes the approved bootstrap Apply;
Terraform manages the management project, `*-tfstate` bucket, S3 access and its
management Secrets Manager entry. The broker then verifies
migration to `terraform.tfstate` in eu01. No manual S3 keys are needed.
**Register existing S3 backend** remains the optional existing-infrastructure connection.
The bucket is not created in advance outside Terraform state. Plan and
Apply start only through their respective explicit UI actions.

`npm run build` produces API/package artifacts and `apps/web/dist`. `npm start` starts the built API. With `LZC_WEB_ROOT`, it also serves the built UI. The [CF manifest](../deploy/cloud-foundry/manifest.yml) sets the path and `HOST=0.0.0.0`, and uses the `PORT` provided by CF. `vite preview` is not a production server.

<a id="arbeitsbereich-und-konfiguration"></a>

## Workspace and configuration

The normal entry path is **Sign in > Open workspace > Open or create
configuration > Edit > Plan > Apply**. On first entry, users can
open their personal or an organization workspace and create new
workspaces. On later entry through `/`, the last
opened workspace is resumed if it remains accessible. Explicit
page URLs are preserved; workspace switching is available in the header.

**Workspaces** comes first in the main navigation. Opening one leads to
the selected workspace's configurations, or to Application Owners' own
application view. **User management** manages members, roles and
groups in the active workspace. Authorized Platform Engineers can create
and delete their own groups and assign and remove members.
Group members are displayed with their confirmed STACKIT email;
user IDs remain internal. Legacy accounts without STACKIT email keep their
username; unknown names are not replaced with IDs.
The automatic **Application Owners** group follows roles and cannot
be changed manually. Groups with template grants can be deleted only after those
grants are removed; workspace members are preserved.
Template group grants remain under **Application Landing Zones >
Publication**, not in an additional groups tab. Selecting and
creating other workspaces is not part of user management.
Even a new inline STACKIT login from a previously open administration page
leads to workspace entry when there is no open draft. Already authenticated
deep links and saved login drafts are preserved.

**Configurations** is the platform overview. **New configuration** leads to
template selection. An open configuration has the context **Configuration >
Deployment > History** with its saved revision visible.
**Save and go to deployment** adopts the newly saved server
revision, not the old draft state. Unsaved changes block the
direct deployment tab; switching workspaces asks before losing them.
History is read-only and limited to the relevant configuration.

Deployment shows each configuration's latest run, provided it is not
expired or already used, together with running executions and
required recoveries. Older,
expired Plans or those already used for Apply are shown by default
under **History (count)**. Their details can be expanded individually without
Apply approval; CLI output and evidence remain readable. Expiry moves a
Plan to history even without reload. The view neither deletes nor renews
artifacts and lifts no ongoing execution/recovery blocks.

Reload reads the remembered configuration ID again from the server within the
user/workspace scope. This neither saves nor confirms credentials
or Apply approvals. Preparation, Plan and Apply remain explicit actions;
navigation neither refreshes nor rebinds existing Plan artifacts.
Application Owners retain their separate Application Landing Zone entry.

<a id="aktueller-funktionsumfang"></a>

## Current functionality

- Private configurations in PostgreSQL, per user and active workspace.
	Under **Configurations**, users can also save incomplete drafts,
	reopen them, save as a new copy and delete them. Revisions prevent
	overwrites by parallel tabs; on conflict, the draft is preserved.
	GitHub is not required and remains available as optional versioned
	storage. The database path requires migration
	`015_configuration_storage.sql`; existing configurations are visible only to their
	creator. Organization workspaces require the Platform
	Engineer role. Intermediate browser state does not replace this persistence.
- Template catalogue, standalone editor with field help and graphical structure.
- Native `.tfvars` download and atomic GitHub export with JSON, tfvars, CLI instructions and an optionally verified S3 backend.
- GitHub login, PostgreSQL sessions/RLS and personal tokens in Secrets Manager.
- Personal deployment credentials: save/delete a service account key file; check authentication and organization read access. [Details](../docs/deployment-credentials.md).
- Immutable deployment preparations from fork configuration, target and personal credentials. [Details](../docs/deployment-preparation.md).
- Browser back/forward and direct page URLs.
- Initial provisioning Plans and an approval-bound platform Apply path: RLS jobs, isolated CF tasks and value-free result display; see [process and acceptance](../docs/plan-execution.md). No customer Apply in this acceptance; chat remains open.
- Application test catalogue: immutable tenant-bound project template versions, orders without a fork, idempotent instance jobs and explicit Plan blockers. No application cloud execution; see [publication and ordering](../docs/template-parameters-and-bindings.md#tenantgebundener-testkatalog-und-bestellungen).

The application service is disabled by default. After applying migration
`010_application_catalogue.sql` with the existing migration identity,
`LZC_APPLICATIONS_ENABLED=true` enables the API in the authenticated server. Missing tables
prevent startup. `/applications` is its own SPA route; the API lives under
`/api/v1/applications/templates` and `/api/v1/applications/instances`. All requests
need the active tenant header; mutations additionally require origin/CSRF checks.
The feature flag enables only the test catalogue and order jobs, never
a Runner or Apply. The existing platform Plan pipeline remains unchanged.

Details and boundaries: [forks and navigation](../docs/forks-and-navigation.md),
[GitHub login](../docs/github-login.md). Check the HCL export roundtrip with Node 24 in PATH:
`cd ../tools/hcl-adapter && go test ./... && go run . -check`.

<a id="state-backend-und-unabhängiger-export"></a>

## State backend and independent export

Platform bootstrap temporarily uses durable encrypted
HTTP state. After the approved bootstrap Apply, it migrates to the LZA management bucket;
the primary HTTP state is removed only after server-side hash/version evidence.
Native S3 states use `use_lockfile = true`; application instances
each have their own state keys. Legacy state mappings remain blocked until explicit
migration. Unconfirmed migration/recovery requires a state export
and operational reconciliation; complete automatic recovery after hard
Runner loss is not guaranteed. Cloud locking has not been tested live.

GitHub stores JSON, tfvars and CLI instructions under `src/config/custom/<id>/`,
plus `backend.tf.json` if the API verified the source binding.
The first save of a DB draft retains its ID; existing Git bindings
retain their own ID. The browser cannot specify backend descriptors.
Neither AWS/SA keys nor state files are exported. Backend service errors,
manually changed backend files and lost bindings abort export.
A differing source ID alias is not registered anew during export; preparation
requires explicit selection of the existing backend ID.

CLI operation requires the reviewed Accelerator code and management access
from LZA Secrets Manager. Disable the original backend block in `src/backend.tf`,
copy the exported `backend.tf.json` to `src/` and retain exactly one
active backend block. Set AWS keys as `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`, then in `src`:

```sh
tofu init
tofu plan -var-file=config/custom/<id>/landing-zone.tfvars
```

Without a verified binding, first perform LZA bootstrap with secured state and
subsequent verified S3 migration. Export executes neither Apply nor
migration. [Lifecycle and recovery boundaries](../docs/plan-execution.md#state-lebenszyklus-gemäß-lza).

<a id="lesende-plattformprüfung"></a>

## Read-only platform check

```sh
npm run platform:check
```

Requires the STACKIT CLI and the two ignored files in the repository root. Reads `PROJECT_ID` and optionally `REGION`; without a region, `eu01` is used exclusively for inventory. `ORGANISATION_ID` remains reserved for later organization mapping.

The script does not execute `.env` as shell code. It obtains a short-lived token without persisting CLI login and queries only metadata through GET. Output contains status codes/counts, no tokens or raw responses. Unexpected errors produce exit code 1; the known Object Storage status 404 is reported as `enabled: false` and pending IaC provisioning. The check provisions or enables nothing. Operating system certificates are enabled for corporate proxies; TLS verification remains on.

The model catalogue does not prove project-specific inference activation. Read permissions do not prove create/change permissions. CF platform offerings replace neither a CF organization nor runtime access. Results: [platform check](../docs/platform-check.md).
