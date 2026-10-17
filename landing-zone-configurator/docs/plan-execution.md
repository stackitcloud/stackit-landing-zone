# Initial provisioning plans

[English](plan-execution.md) | [Deutsch](plan-execution.de.md)

<a id="erstbereitstellungspläne"></a>

As of: 2026-10-02. Implementation on `feature/landing-zone-configurator`.

<a id="was-der-benutzer-testen-kann-nach-erfolgreichem-release"></a>
## What the user can test (after a successful release)

1. Open **Deployments** and select a saved preparation in **Plan initial provisioning**.
2. Only for a new Landing Zone, confirm that no resources or existing state for this configuration exist yet. Existing/partially created Landing Zones are not supported in this workflow.
3. Start **Plan initial provisioning**. Expected stages: prepare Runner, initialize, validate, plan and completed/failed.
4. Reload the page: job and result are retained. Creation, modification, replacement, deletion, data reads and changed outputs are counted separately.
5. Optionally cancel another Plan. Cancellation immediately revokes broker access; cleanup stops the CF task after a delay.

**No customer execution in this acceptance.** The user explicitly requires fresh approval before every customer Apply; infrastructure approvals do not cover this. The older initial-provisioning plan remains Plan-only. The new platform path has a gated Apply endpoint: only with execution enabled, matching immutable plan artifact/hash, confirmed target organization and rechecked access, source and state bindings. Export is not Apply approval. No Destroy path.

A successful Plan is not automatically eligible for Apply. For blocked approval, the server returns an error code and, for unsupported components, the affected fields with reasons. Plan and Apply pages show this block; the Apply button remains visible but disabled. An eligible Plan still shows explicit review confirmation and requires the exact UUID of the target organization. All conditions are checked again server-side before Apply.

Firewall/HA infrastructure is currently qualified only for Plan. A new Plan alone does not lift this component block. The administration and bootstrap contract must be qualified separately for Apply; firewall policy and VPN PSKs are not silently omitted. Configuration and Plan evidence remain unchanged. Component-specific execution qualification continues in [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89).

<a id="plattformentwürfe-mit-projekt-templates"></a>
## Platform drafts with project templates

New editor configurations contain project template drafts instead of concrete application projects. Their tfvars export, and thus their initial-provisioning plan, contain **only the platform**, no instances of these templates. Old combined configurations retain their previous projects. [Details and legacy protection](project-template-drafts.md).

<a id="application-plan-input-und-plattformvertrag"></a>
## Application Plan input and platform contract

The locally enabled Application catalogue has its own approval and ordering path. It **does not yet start a CF task** or create state. `Check Plan input` is renewed server-side qualification and shows Terraform variables, entry point and execution block, not a calculated resource result.

A Platform Engineer can load a JSON contract from already applied, checked platform outputs in the Application catalogue. The document is not Terraform state and contains no credentials. Minimal import contract:

```json
{
  "schema_version": 1,
  "organization_id": "00000000-0000-4000-8000-000000000001",
  "targets": {
    "public": {
      "folder_id": "00000000-0000-4000-8000-000000000002",
      "region": "eu01",
      "corporate": false,
      "network_area_id": null,
      "firewall_next_hop_ip": null,
      "ipv4_nameservers": null
    }
  }
}
```

The UUIDs are placeholders and must come from the actually applied platform. Approval is a deliberate PE review of outputs, **not automatic confirmation that a specified folder exists or belongs to the organization**. This resource check remains necessary before future job/credential release.

- GET/POST `/api/v1/applications/platform-contracts`: current tenant membership; POST additionally requires PE role, valid human STACKIT identity, Origin/CSRF, `confirmApproval: true` and stored SA access. Optional `credentialProfileId`; automatic selection if exactly one profile is stored. Organization access is checked technically without requiring a second human OAuth login.
- Tenant and revision are determined server-side. Migration 014 persists immutable contract versions with Forced RLS and technical verification/version evidence. An access test or contract is not Apply approval.
- POST `/api/v1/applications/templates` can jointly bind `platformRevision` and `targetKey`. Region and project type must match the contract target; cross-tenant contract IDs are not visible. A change creates a new version.
- POST `/api/v1/applications/instances/:id/plan-input` accepts only `{}`. Owner is determined from session and order; other people's orders and client identity/backend overrides are rejected. Identity expiry, revocation, role removal and changed requester email are checked again.
- The compiler uses exactly the order's contract and template versions, fixed parameter rules and own instance state key. The MVP subset is Public with local network, without Observability execution or namespace services. The response explicitly reports `cloudPlanExecuted: false` and `executionEnabled: false`; no keys are delivered to the browser. Immutable version/order policy is adopted as `applyPolicy` (`approval-required` or `direct`); `requiresExplicitApplyApproval: true` remains set for both. Direct policy is not execution approval.

An actual independent cloud Plan still needs an immutably approved Application Runner artifact, separate state backend with locking and tightly limited server-side use of PE access by exactly the authorized job. The previous Runner pin contains no Application root. It is not switched to unchecked worktree code. Application Apply remains disabled; the approval-bound platform Apply path is separate.

<a id="gemeinsamer-editor-und-ausführungsumfang"></a>
## Common editor and execution scope

Schema v3 is supported for a conservative standalone subset: eu01, organization owner/auditor, folders with names and owner/read permissions, optional parent folder (UUID), explicit Public projects in existing combined configurations, sandbox projects, basic settings and the previous Secrets Manager option. Empty or unset folder descriptions are permitted; populated descriptions are specifically rejected until #82 is fixed because the Accelerator does not adopt them. Network, Kubernetes, firewall and additional platform or project services remain blocked for this Runner. Checking uses the effective configuration, not the template name. UI, preparation and broker use `initialPlanIssues`; checking is repeated before handing credentials to the Runner. JSON and tfvars remain bound to the same Git revision and unchanged export hash. Legacy documents remain supported.

Organization-tenant blocks still apply. The older initial-provisioning plan uses empty state. In the new platform path, existing state is used exclusively through the checked backend binding; missing or contradictory bindings must not trigger a silent restart with empty state. Extended execution: [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89).

<a id="ablauf-und-grenzen"></a>
## Workflow and limitations

**Private Kubernetes APIs:** The current CF Runner has no demonstrated access to customer SNAs. A successful STACKIT access test does not demonstrate this network path. Even Plan/Refresh with Kubernetes/Helm providers can need it. Two-stage execution from [#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) remains open and is implemented separately. Requirements for execution guards when extending the existing standalone contract are in the [limitations register](accelerator-limitations.md#private-kubernetes-api-ausführungsgrenze).

- POST `/api/v1/plans` requires session, exact Origin, CSRF token and `confirmNewDeployment: true`. Only one's own preparation with one's own stored credential and admin/deployer role is accepted.
- GitHub fork access, recorded head and generated tfvars export are checked again with the GitHub user token. A changed fork head requires new preparation; another version is not silently adopted.
- SQL 004/005 persists jobs with Forced RLS, preparation, status, engine/provider lock version and CF droplet reference. One active job per user/tenant, at most 20 starts in 24 hours; list shows the latest 100.
- Dispatcher manages exclusively the separate organization `lzc-dev-runners`, space `plans`, SSH disabled. For every job, it creates an app without route/service bindings and copies the checked Runner droplet. CF manager credentials remain in the trusted API backend/release.
- Runner receives three app variables: job ID, fixed broker URL, random 256-bit ticket. Only its hash is stored in PostgreSQL. Validity at most 25 minutes. A narrowly scoped SECURITY-DEFINER function resolves the ticket to exactly one active job; owner/tenant RLS and role checking apply afterwards.
- Inputs are issued once, after renewed role, profile, version and organization checking. Other profiles or tenants cannot be selected. Terraform subprocesses receive an explicit environment without the broker ticket.
- Fixed Accelerator commit `a256f6896d11134fdc351786f1be5eba4e56b2e2`, OpenTofu 1.12.6, provider-lock SHA-256 `a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888`. CI builds only upstream code of this commit and a Linux provider mirror.
- OpenTofu 1.12.6 does not export Terraform's `complete` field in saved-plan JSON 1.2. For this exact format, the worker may confirm completeness only after checking the pinned engine and its fixed complete Plan command without targeting. The summary parser requires this explicit engine context; missing context, unknown versions/formats or deferred metadata remain `not-reported`, a reported partial plan remains `incomplete`. Error status, open/failed checks and all artifact/state/approval bindings continue to block Apply. Previously saved summaries are not rewritten.
- Direct commands in `deploy/runner/run-plan.sh`: init with readonly lock, validate, plan with detailed exit code and show. No freely selectable command. The new platform path may execute Apply only with the approved saved plan.
- Result projection contains only counts, status and fixed error codes; no addresses, attribute values, output names, raw diagnostics or secrets. Even values not marked sensitive are not exported into this summary. Separately, under **OpenTofu output**, Runner shows the authorized Plan owner normal CLI text: live logs from the private active job or `tofu show -no-color` of the exactly hash/package-bound, encrypted saved plan artifact. Session, deployment role and owner/tenant RLS are checked before every access; responses are `no-store`. Resource addresses and normal attribute values are visible there; sensitive values remain masked by OpenTofu. Known credential fields are additionally removed from live logs. Plan binary and `show -json` remain server-side. No new cloud Plan, Apply or backend init runs; inspection uses only backend-free init and show without inherited secrets. Apply expiry remains independent of the read-only display as long as the encrypted artifact exists.
- Active platform jobs open an NDJSON live channel at `GET /api/v1/plans/:id/output` with `Accept: application/x-ndjson`. JSON snapshots remain for history and existing clients. Worker reads complete log lines every 500 ms and transmits only changed, redacted transcripts. After encrypted commit, the API notifies its local subscribers; other API instances recheck within one second at the latest. Unchanged output creates only a heartbeat, not a new transcript. Session, workspace, deployment role and ownership are rechecked during the connection, not only at opening. Connections end after at most 35 seconds and reopen if the job is still active. Collapse, navigation and logout abort them. Per owner/tenant, each API instance permits at most eight connections; slow readers cause backpressure rather than unbounded queues.
- Plan uses OpenTofu's native `-json` UI events for actual progress messages, even before the completed diff exists. Only human-readable messages of the supported UI protocol are projected; raw events, metadata and output values are not sent to the browser. Incomplete lines are withheld; invalid events receive a visible fixed error notice. Afterwards `tofu show -no-color plan.bin` adds the complete normal plan text. Init, Validate, Apply and migration retain native CLI output. No estimated percentages: if OpenTofu produces no message during an operation, phase and elapsed time remain visible.
- During the run and before the terminal result, worker saves the redacted CLI transcript of Init/Validate/Plan/Apply/migration through `POST /api/runner/output`. The job-specific ticket must be valid and input already claimed; text may be updated until completion, then is frozen. Migration 020 creates private output columns under existing owner/tenant RLS. Broker encrypts at most 2 MiB with AEAD and job-specific AAD. Success and failure output remains readable after cleanup and reload without a running Runner. Truncation is marked. A hard process abort or failed upload can still lose historical output; best-effort saving neither triggers an Apply retry nor replaces the durable state-recovery receipt. Apply evidence shows the exact plan, SHA-256, target organization, job's state backend and completion time. An incompatible native Runner package blocks Apply before dispatch; a new Plan with renewed review and approval is required.
- Task: 1 GiB RAM, 4 GiB disk, 18-minute engine deadline, bounded private files. SQL deadline: 25 minutes. Maintenance every 30 seconds, cleanup after at least 30 seconds in terminal status. Jobs are cleaned up even after API restart. CF/network errors can delay cleanup; ticket expiry remains independent.
- No automatic dispatch retry. Process loss before start leads to cancellation/expiry rather than silent re-execution. No general queue scheduler or durable Runner heartbeat monitoring yet. The new platform path stores plan artifacts encrypted and binds them to source, engine and state version. CF quotas additionally limit overall capacity.
- Preparations with Plan evidence are not deleted. Archiving and metadata retention periods are a subsequent step.

<a id="state-lebenszyklus-gemäß-lza"></a>
## State lifecycle according to LZA

User decision: adopt existing [LZA bootstrap](https://github.com/stackitcloud/stackit-landing-zone/blob/main/docs/getting-started.md). Stored access is the bootstrap service account; project and account are not recreated. A Plan creates neither management project nor bucket. In the new platform path, the durable encrypted HTTP backend serves only bootstrap, not as a permanent replacement for customer S3 state.

At the separately approved first Apply, the management module creates the customer state bucket with credentials. Afterwards Runner migrates with `tofu init -migrate-state`; the API confirms migration only after comparing state hash and remote version/ETag and bound state version. Only then is the HTTP primary state removed. The verified management service account is used subsequently. The S3 backend uses `use_lockfile = true`. Application instances each receive their own keys `applications/<tenant-id>/<instance-id>/terraform.tfstate`; platform, Application and Configurator infrastructure states remain separate.

Legacy state mappings are blocked with `legacy_state_migration_required` and require explicit mapping/migration, not new empty state. For `state_failed` or unconfirmed migration, explicit state reconciliation is required before resumption; a completed S3 copy can be confirmed without another Apply as described below. Other recovery cases still need a protected export. Runner transmits checked, encrypted recovery evidence and removes local error states only after matching durable receipt confirmation. This does not guarantee automatic complete restoration after every hard Runner loss; reconciliation and operational recovery remain necessary. No real cloud S3 lock test was performed. No customer Apply was executed in this implementation.

<a id="konfiguration-nach-fehlgeschlagenem-bootstrap-apply-korrigieren"></a>
## Correcting configuration after a failed bootstrap Apply

Migration `034_platform_reconciliation.sql` adds explicit, audited UI reconciliation. In the Apply view, only **Check checkpoint** reads the encrypted bootstrap checkpoint of one's own failed Apply. The response contains only state version, SHA256, serial, lock/migration status and resource counts by type; no attributes, outputs or raw states.

**Allow replanning** requires separate confirmation to preserve state unchanged. The API rechecks the displayed version and checksum in a transaction. Only an already started Apply regularly terminated with `apply_failed`, with readable bootstrap checkpoint, positive state version, no held lock, open migration or separate recovery state, is eligible. Immutable tenant/owner-bound audit evidence binds Apply, real session, state key, version and checksum. Concurrent identical confirmations create only one record. The run is completed as failed; state, version, lock and backend remain unchanged. No cloud access or automatic Plan/Apply occurs.

The user can then save the corrected configuration, choose a new preparation and start a new Plan against the same existing state. Apply again requires separate review and approval of the new saved plan. The old plan remains consumed. If the checkpoint has changed meanwhile, a new check is required. Ambiguous Runner aborts, unverifiable migrations and separate recovery states remain blocked and need separate operational reconciliation. No automatic unblocking, state deletion, import or Destroy action. The migration must be enabled before using the new API.

<a id="erfolgreichen-apply-mit-offener-s3-bestaetigung-abschliessen"></a>
### Completing a successful Apply with pending S3 confirmation

OpenTofu 1.12.6 uses a new lineage and serial 1 for HTTP-to-S3 migration. This is reproduced with the real pinned Runner binary and exclusively synthetic local HTTP/S3 endpoints, even after multiple writes to source state. The former requirement for identical overall hash, lineage and serial rejected this successful copy. Besides an exact full copy, `migrationStateMatches` accepts only this demonstrated transformation: source version 1.12.6, new lineage, target serial 1 and otherwise exactly identical canonical state content. Resources, attributes, outputs, format, version and all other fields remain fully checked. Only ordering of the top-level `check_results` list is normalized in the pinned native migration comparison. All complete check entries, including nested content and duplicate entries, are retained; nothing is removed or reduced to successful status values. This ordering change is reproduced with real OpenTofu validations. Global state hashes, source backup evidence and other array orders remain unchanged. Changed check results or resources remain blocked. Unknown versions or arbitrary serial/content changes are not approved. The host binary must not be assumed to be the Runner version; the native test uses `LZC_NATIVE_TOFU_BINARY` and checks the real version.

For a regularly terminated `state_failed` with a bound open migration, **Check checkpoint** reads encrypted bootstrap state and already registered S3 state on explicit click. Only aggregated metadata is shown, including S3 check status, serial and the boolean indicating whether lineage was retained. Without lock, separate recovery or differing content, users can **Confirm backend migration** themselves.

This confirmation binds source version, source SHA and exact remote object version. All evidence is rechecked before completion. In the same transaction, the existing CAS backend switch, immutable audit evidence and completion of Apply as `succeeded` take place. Only after successful S3 reconciliation is temporary bootstrap primary state removed. Identical concurrent confirmations are idempotent. This starts no Runner, Apply, S3 write, import, unlock or Destroy. If check status changes, bootstrap backup and recovery block are retained. No new schema migration is required.

<a id="lokale-aktivierung-am-2026-10-06"></a>
### Local activation on 2026-10-06

After explicit approval, the running customer DB was privately backed up, the full dump restored in a separate loopback-bound PostgreSQL 17 instance and upgraded there to migration 034 with the real migrator. Row counts and hashes of all 32 existing tables in `lzc` and `lzc_auth` remained unchanged. Only then was the API restarted with no running customer jobs. The same comparison also passed after live migration.

The live DB now contains migrations 001 through 034; the new audit table is empty and has enforced RLS. The failed Apply remains `recovery_required`. The previous immutable platform Runner package remains active; Application execution remains explicitly disabled. API and UI proxy answer health checks with 200, new checkpoint/approval routes without login with 401 and disabled Application Runner with 404. The UI serves the qualified current build. The temporary restore instance and its own volume were removed; private dump and hash evidence remain for recovery.

This activation checked only backup, schema, data preservation and access guards. The customer checkpoint was neither decrypted nor approved. The real checkpoint check and confirmation are performed by the user in their authenticated UI. No cloud Plan/Apply was started.

<a id="aktivierung-des-s3-abschluss-fixes-am-2026-10-06"></a>
### Activation of the S3 completion fix on 2026-10-06

After the user reported successful Apply and `init -migrate-state`, current DB state was privately backed up again. No platform or Application jobs were running before the code-only restart. Row counts and hashes of all 33 existing tables, now including recovery evidence, remained unchanged after restart. Migrations 001 through 034, bound native platform package and disabled Application execution remain. API and UI proxy `/healthz` return 200; checkpoint/approval routes without login 401 and disabled Application Runner 404.

The current build passes the canonical gate with 376 unit tests and all 42 isolated PostgreSQL broker cases, 16 backend tests including real local OpenTofu 1.12.6 migration and 12 affected desktop/mobile browser cases. Browser and broker cases use controlled test data; they do not demonstrate successful S3 reconciliation of the customer run. This was neither read nor confirmed during activation and remains an explicit UI step for the user. No customer Apply was repeated.

<a id="nachgewiesene-check-reihenfolge-und-korrektur-am-2026-10-06"></a>
### Demonstrated check ordering and correction on 2026-10-06

After explicit approval, exactly the open migration case was decrypted locally and its bound S3 state compared read-only. Only masked structural paths and equality/count metadata were output, no values, keys or raw states. All 36 complete check entries were equal but differently ordered; resources, attributes and outputs were identical. The corrected comparison also passes for this state. The previous comparison was reproduced as a failing native regression case with 24 real local OpenTofu validations.

After a fresh private backup and zero active jobs, only the API was restarted with unchanged platform package. All 30 non-authentication tables, particularly states, backends, plans, artifacts and recovery evidence, remained unchanged. In parallel, an additional session and changes to identity/access metadata were observed; these three tables are therefore not reported as unchanged and were not reset. No schema migration or S3 write was performed; actual backend confirmation remains a separate user UI step. The gate passes with 387 unit tests, 27 backend tests including native migration and all 42 isolated PostgreSQL broker cases.

<a id="portabler-github-export"></a>
## Portable GitHub export

Export atomically writes `landing-zone.json`, `landing-zone.tfvars` and a short CLI guide under `src/config/custom/<configuration-id>/`. For server-verified S3 binding, it adds `backend.tf.json`: complete standard Terraform backend configuration without AWS/SA keys or state file. Only `backend_not_found` allows a new bootstrap export without backend; service and permission errors abort saving. An existing backend file must exactly match the deterministic Git blob hash of the checked descriptor. Otherwise `backend_configuration_changed` applies; if binding is absent, `backend_configuration_missing` applies instead of metadata loss.

At first DB-to-GitHub export, configuration ID is retained. An already opened Git configuration keeps its own ID. For a differing source ID, the server exports the bound descriptor without alias or state mutation; new preparation must explicitly select the registered backend ID. For independent CLI operation: use checked Accelerator code, disable the original backend block in `src/backend.tf`, copy the exported backend file to `src/backend.tf.json` and retain exactly one active backend block. Load AWS access from management Secrets Manager into the environment according to LZA, then `tofu init` and `tofu plan -var-file=config/custom/<configuration-id>/landing-zone.tfvars`. Without S3 binding, first complete LZA bootstrap and verified state migration.

<a id="abnahme"></a>
## Acceptance

- [x] API: session/CSRF, strict input schema, initial-provisioning confirmation, personal GitHub token and no Apply endpoint tested.
- [x] PostgreSQL: foreign jobs, concurrent start, ticket replay, status ordering, expiry and targeted cleanup tested.
- [x] CF client: own app, fixed commands, only three job variables and no route.
- [x] Desktop/mobile: Plan start, running status, result after reload, no Apply.
- [x] Local real OpenTofu contract test without cloud access and without Apply.
- [x] Separate CF organization with manager created through platform IaC.
- [x] Runner space/roles successfully applied through runtime IaC.
- [x] Linux package, provider mirror and CF engine test successful.
- [x] Live app: check separate Runner without service bindings, invalid ticket must not execute a customer job; remove probe app.
- [ ] First personal customer Plan by the user.

<a id="live-abnahme-vom-2026-09-30"></a>
## Live acceptance on 2026-09-30

[Release 36727211809](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36727211809) for `b5686ef` successful: CF engine init/validate, database migrations, PostgreSQL/Secrets Manager connections, separate probe app and public route. Runner management identity has no access to the Configurator app; probe app without routes or service bindings. A random unregistered ticket caused a failed task. This is an infrastructure/isolation probe, not yet a successful personal customer Plan.

Measured from dispatch to task creation: **3.907 ms**; to observed task completion: **12.244 ms**. A single value, not a latency guarantee. The probe uses the prestaged template, not `cf push` per job. Regular job execution additionally includes input/access checking and OpenTofu runtime. No customer Apply.

<a id="quellen"></a>
## Sources

[OpenTofu JSON format](https://opentofu.org/docs/internals/json-format/),
[Plan exit codes](https://opentofu.org/docs/cli/commands/plan/),
[CF V3 droplet copy](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#copy-a-droplet),
[CF V3 tasks](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#create-a-task).

<a id="release-des-v3-standalone-planpfads-2026-10-01"></a>
## Release of the v3 standalone Plan path (2026-10-01)

Commit `9aa3322`, [release 36849188406](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188406) and [validation 36849188417](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188417) successful. Locally 123 unit, 22 PostgreSQL and 38 browser checks; real OpenTofu Plan summary test and four native Application root contracts with 1.12.6. Database checking covers legacy/v3 and renewed broker blocking checks. Live app serves the new bundle, health 200 and anonymously protected APIs 401. This is neither personal customer Plan acceptance nor customer Apply.

<a id="governance-qualifikation-und-service-account-föderation-2026-10-01"></a>
## Governance qualification and service-account federation (2026-10-01)

Governance input approval is additionally checked with the actually used governance module: `npm run test:plan` calls separate `test-governance-contract.sh`. Source hashes bind checking to the Accelerator pin. OpenTofu 1.12.6 plans with mock providers in a cleaned environment, without cloud credentials or Apply. Checks cover organization roles `owner`/`organization.auditor`, folder roles `owner`/`auditor`, omission of duplicate folder assignments for organization owners and both parent variants. This local qualification does not replace a Plan against the specific customer organization.

**Service-account federation for CI/CD** is an optional editor component. It controls which external pipeline OIDC tokens may use the management service account; it is not user login to the Configurator. `issuer` is the trusted issuer, `aud` the token audience and `sub`, for example, the specific GitHub repository with branch. Conditions use comparison `equals` supported by the pinned provider; `aud` is required. The GitHub template limits `sub` to a specified branch and does not apply unchanged to jobs with GitHub environments.

The component sets up neither workflow nor token exchange and removes no existing keys. It is not required for the current Configurator Runner or a small initial-provisioning plan. Its execution remains blocked until separate Runner qualification; saving and editing configuration remain possible.

Source: [STACKIT Provider 0.114.0 – Service Account Federated Identity Provider](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/service_account_federated_identity_provider).

<a id="release-nachweis"></a>
### Release evidence

- Source `64e33cb`, [release 36856248765](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36856248765) and [validation 36856248770](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36856248770) successful.
- Local: 140 unit tests, desktop/mobile browser checks including overflow checking, three governance mock plans and existing OpenTofu Plan/Application contract tests successful.
- Live: SPA and assets HTTP 200 (`index-CnPzJNzo.js`, `index-DoULK2fp.css`), `/healthz` HTTP 200, anonymous session HTTP 401. Release connection tests successful.
- No customer Apply, no acceptance of a real customer Plan and no merge to main.

<a id="begrenzte-plattform-credential-grants"></a>
## Limited platform credential grants

Implemented locally on 2026-10-05, not yet enabled in the running customer API: migration `025_plan_credential_grants.sql` creates a grant in the same transaction at explicit Plan start or existing explicit Apply approval. No general credential delegation and no automatic retrofitting of old waiting jobs.

Immutable evidence binds job, tenant, user, preparation, organization, credential profile, secret version, key ID, manifest hash and operation (`plan` or `apply`). Its validity ends no later than the job ticket or issuing session. It contains no keys or tokens. SQL checks binding to the real job and its preparation data; RLS limits access to the currently authorized deployment user who owns it.

Runner claims the grant once before technical credential checking or secret retrieval. Missing, expired, revoked or mismatching grants block this use. Before returning key, backend and, if applicable, saved plan, grant, expiry and initiating job are checked again. A failed claim is not reset; a new job requires new explicit approval. Concurrent input requests can receive credentials only once.

`POST /api/v1/plans/{id}/credential-grant/revoke` requires Origin, CSRF, current `x-lzc-tenant` and exclusively `{"confirmCredentialGrantRevocation":true}`. Repeated revocation returns the same evidence. Normal Plan cancellation also revokes an unused grant. Already claimed grants return `credential_grant_already_consumed`; credentials already transferred cannot be retrieved from a Runner. Running worker, cloud IAM key rotation and recovery must be handled separately in such an incident. Ticket-bound result/recovery endpoints remain unchanged and are not another credential issuance.

This boundary limits credential retrieval, not cloud IAM permissions of the key or an already running operation. Least-privilege qualification, Application root/instance dispatch with own state and grant, and real two-organization/revocation acceptance remain #91/#93. This step gives AOs no access to platform credentials. 31 real isolated PostgreSQL broker/grant cases and the canonical overall check pass.

<a id="lokaler-application-runner-root-2026-10-05"></a>
## Local Application Runner root (2026-10-05)

The intermediate feature status is saved locally as `4ad9367`. The separate Application source pin is `4d15d7870afa323badd93559d8b37c5a8d138dcf`; backend, provider and version requirements are in separate files. The previous platform pin `a256f6896d11134fdc351786f1be5eba4e56b2e2` and already bound Runner packages remain unchanged.

With `LZC_LOCAL_RUNNER_PACKAGE=true` and `LZC_PACKAGE_APPLICATION_ROOT=true`, the build script additionally packages exclusively `src/application` and `src/modules/landing-zone` from the fixed Git pin as `application-src`. Use a new, not-yet-existing `LZC_RUNNER_PACKAGE_DIR`. Its own provider lock pins STACKIT 0.114.0 and time 0.14.1, with checked checksums for Darwin ARM64 and Linux AMD64. Its SHA-256 is `d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5`. Application packaging is deliberately blocked for production builds.

New worker modes `application-plan` and `application-apply` require the fixed Application pin/lock and strict binding of `tenantId` and `instanceId`. S3 key must be exactly `applications/<tenantId>/<instanceId>/terraform.tfstate`; lockfile is mandatory. Bootstrap/platform state and arbitrary root paths are rejected. Working directory retains the relative module path but is separate from the platform root. Apply uses only the saved plan, without replan or bootstrap migration. If recovery transfer fails, only the private Application recovery state and its directories are retained.

This is not yet Application broker dispatch or cloud IAM scope: `executionEnabled: false` remains. Instance jobs, own real locks, PE-authorized credential grants, expiry/revocation, quotas and explicit upgrades still need connecting. The new source pin needs explicit new template publication; stored versions/plans are not rebound. No active package was replaced and no customer operation started. Worker tests use a controlled engine, while package init/validate and native mock contract tests use real OpenTofu.

<a id="vorbereitete-application-jobs-und-grant-belege-2026-10-05"></a>
## Prepared Application jobs and grant evidence (2026-10-05)

The term source pin means a fixed Git commit ID of Accelerator Terraform code, not credentials or a personal PIN. New publications can explicitly set `acceleratorRevision` to qualified Application commit `4d15d7870afa323badd93559d8b37c5a8d138dcf`. This creates a new immutable template version; the previous default and all old versions remain unchanged. Other commits are rejected. API pin selection is not yet connected as an additional UI publication step.

Migration 026 stores jobs with status `prepared` and SQL-derived grant evidence. `POST /api/v1/applications/instances/{id}/jobs` requires exactly `{"idempotencyKey":"<uuid>","confirmPlan":true}`. Session, current tenant, Origin and CSRF are checked; role, verified requester identity, ownership, version/policy and compiler inputs are reread from stored records. Only the qualified Application source revision is accepted. A transactional lock serializes the idempotency key. Repetition returns the same valid job; an expired or revoked grant is not renewed by retry. A fresh job needs a new key and renewed explicit confirmation.

The SQL trigger checks real session, verified organization, current PE membership of the contract approver and current requester identity. It derives organization, profile/secret version/key ID, requester, instance, template/contract version, source revision, compiler hash, operation and state key. Expiry is bounded by real session, human token and at most 25 minutes. The app role may not insert grants directly or change bindings; tenant/owner RLS and immutable evidence remain enforced.

`POST /api/v1/applications/jobs/{id}/credential-grant/revoke` requires exactly `{"confirmCredentialGrantRevocation":true}` with the same HTTP boundaries. Requester or contract-approving current PE may revoke within the tenant. Repetition returns the same timestamped evidence; revocation cannot be reset.

The job response contains only ID, instance, status and expiry plus `executionEnabled:false` and `cloudPlanExecuted:false`. No credentials, ticket or Runner start. Grant evidence is not yet one-time credential handover, state file or cloud operation. One-time issuance under renewed authority/profile checking and real instance-bound S3 state/lock access must be further integrated before dispatch.

<a id="explizite-application-backend-freigabe-2026-10-05"></a>
## Explicit Application backend approval (2026-10-05)

Migration 027 adds immutable backend evidence for a valid prepared Application job. `POST /api/v1/applications/jobs/{id}/backend-approval` requires exactly `{"stateBackendId":"<uuid>","confirmBackendApproval":true}` with session/Origin/CSRF/tenant checking. Only the current PE who approved the platform contract may confirm. SQL rechecks job and grant expiry, revocation, requester session, memberships, organization and both current human identities. The backend record must belong to the same tenant.

The S3 descriptor is derived from the registered backend; its key must be `applications/<tenantId>/<instanceId>/terraform.tfstate`, lockfile remains mandatory. Approval session and backend binding are immutable. Lifetime is the minimum of grant, real PE session and PE identity. Concurrent identical approvals are idempotent; backend switch returns 409. Expired or no-longer-active approval sessions are not renewed even with a new session.

The response contains only job/backend ID, state key, expiry and `executionEnabled:false`. AO can read non-secret evidence, but still no backend credentials. The SQL function reads neither credentials nor real S3 state. The API validates the saved descriptor using the existing S3 contract. Approval evidence replaces neither one-time credential issuance, real S3 access/locking checks, Runner ticket nor cloud Plan/Apply.

<a id="interner-einmaliger-application-claim-2026-10-05"></a>
## Internal one-time Application claim (2026-10-05)

Migration 028 provides the atomic consumption stage. Internal `claimJobGrant` requires the actual still-valid PE backend approval session, not a reconstructed PE identity from the AO call. SQL rechecks all backend/grant authority boundaries and locks the grant row before creating immutable claim evidence. Two concurrent claims produce one success and one conflict. Another real session of the same PE may not take over the claim.

Claim and revocation serialize the same row; only one can succeed. After consumption, no revocation claiming credential retrieval is confirmed; 409 is returned instead. Retrying original job preparation returns no false `prepared` evidence. The app role may neither write claims directly nor reset or delete them.

No browser/Runner endpoint for this method is registered. It returns only job ID, claim time and expiry; no credentials, ticket or Runner start. Subsequent technical profile/version/key checking, secure secret issuance, final authority check and ticket-bound dispatch integration remain necessary. Internal claim alone activates no execution.
