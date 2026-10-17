# Platform operational status after bootstrap and backend

[English](platform-readiness.md) | [Deutsch](platform-readiness.de.md)

<a id="plattform-betriebsstand-nach-bootstrap-und-backend"></a>

**Current (2026-09-30):** Platform recovery and Apply successful. Nine resources are recorded in the encrypted remote state. PostgreSQL is `READY`, CF active, Secrets Manager `Running`. [Recovery/Apply run 36675347654](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347654). CF runtime and access tests remain outstanding.

<a id="abgeschlossen"></a>
## Completed

- [x] Bootstrap state bucket and S3 access created through CI.
- [x] Versioning of this bucket enabled through the backend root: [run 36602706599](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706599), commit `d68c0a1a1199c34cf529ef0a87d62943c35a0585`.
- [x] `Enabled` independently checked directly through the S3 API and encrypted backend state.
- [x] One-time commit/root approvals removed after Apply.
- [x] Accompanying app/IaC validation successful: [run 36602706648](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706648).

<a id="aus-katalogen-vorbereitete-entwicklungsparameter"></a>
## Development parameters prepared from catalogues

The following values were selected from the project catalogues. Binding deployment inputs, including separate network ACLs, are in `infra/environments/lzc-dev.tfvars.json`.

| Parameter | Selection | Reason |
| --- | --- | --- |
| Foundation | Public CF `01.cf.eu01` | Planned application for independent customers |
| CF quota | small: 10 GiB RAM, 10 service instances | Room for web/API/worker and additional instances during deployments; default is limited to three app instances |
| PostgreSQL | Version 17, flavor 2.16 | Available: 2 CPUs and 16 GiB RAM |
| Storage | 20 GiB, premium-perf2-stackit | Available in the catalogue, valid size range 5–4000 GiB |
| Backups | Daily at 02:00, retention 32 days | Development default; define production targets separately |

<a id="plattform-und-verbleibende-abnahmen"></a>
## Platform and remaining acceptance checks

- [x] Network assumption corrected: according to operator knowledge, CF egress IP addresses are undocumented and unstable; do not assume a CF-specific IP allowlist.
- [ ] Evaluate documented STACKIT service networks as a PostgreSQL access model and test access from CF.
- [ ] Clarify the Secrets Manager access model separately; do not transfer PostgreSQL network allowances without checking.
- [x] Migrations planned as CF tasks; technical implementation and operator access still outstanding.
- [x] Connect platform CI with separate environments and its own state key.
- [x] Review the specific platform plan and then deploy.

The first platform Apply was aborted because of the job time limit. The partial inventory has since been successfully imported and deployment completed; see recovery acceptance below. All work remains on `feature/landing-zone-configurator`.

<a id="korrigiertes-netzwerkmodell"></a>
## Corrected network model

The application must not depend on individual observed CF outbound IP addresses. Even a one-time measurement through a test app would not yield a stable allowlist. Service bindings provide credentials and connection parameters; they are not evidence that a network ACL is bypassed or automatically maintained.

For PostgreSQL Flex, the official documentation explicitly lists `193.148.160.0/19` and `45.129.40.0/21` for access from STACKIT services. These documented provider networks are a candidate for the connectivity test, not networks exclusive to our application or tenant. TLS with certificate verification, separate app/migration identities and database authorization remain necessary. Changes to supported networks must be tracked through IaC; these addresses are not guaranteed CF egress CIDRs.

The Secrets Manager's supported access model must be checked independently. The previous shared `service_access_cidrs` parameter for both services must not simply be filled with the PostgreSQL networks before the platform Apply. Separate ACL inputs must be provided where service requirements differ. A dedicated access proxy should only be planned if the supported direct access model is insufficient. Do not infer blanket opening to `0.0.0.0/0` from this correction.

Database migrations should later run as a CF task with a separate migration identity. GitHub Actions starts and monitors the task; the database need not be opened to changing GitHub Runner IP addresses for this. Technical evidence, including credential binding, is still outstanding.

Sources: [PostgreSQL instances and ACLs](https://docs.stackit.cloud/products/databases/postgresql-flex/how-tos/create-and-manage-instances-for-postgresql-flex/), [Secrets Manager configuration](https://docs.stackit.cloud/products/security/secrets-manager/getting-started/configure-the-secrets-manager/), [CF service bindings](https://docs.cloudfoundry.org/devguide/services/application-binding.html).

<a id="konkreter-plattform-entwurf"></a>
## Specific platform design

The versioned file `infra/environments/lzc-dev.tfvars.json` now contains the selected catalogue parameters. Database and Secrets Manager use independent ACL variables. For the development design, both are deliberately restricted to the STACKIT networks `193.148.160.0/19` and `45.129.40.0/21`. These networks are documented for PostgreSQL; for Secrets Manager this is an explicit network allowance as an initial configuration, not a claim of a documented CF network guarantee. Connectivity and authentication must be tested from a CF test app or CF task before use with customer data. If connectivity fails, adapt network configuration based on evidence rather than opening it indiscriminately.

The separate pipeline `configurator-platform.yml` uses the same serialization mechanism as bootstrap, but its own GitHub environments and a separate encryption key. It reads bootstrap/backend outputs protected in memory, checks the applied versioning status and then uses the workload state bucket. Platform parameters, commit, root and plan hash are bound to the Apply check.

Separate approval to store secrets in `lzc-dev-platform-plan` and `lzc-dev-platform-apply` has been given. Provisioning is now executed through a fresh CI plan and an Apply bound to it.

Local technical evidence: real platform plan successful, **9 Create / 0 Update / 0 Delete** (CF organization and manager, PostgreSQL instance/database/migration user, Secrets Manager instance/provisioning user, artifact bucket and Model Serving token). Six platform mock tests, 16 Node tests and workflow checking successful. The local provider download hung; checking was repeated with already installed provider binaries verified against the lockfile. This local evidence involved no Apply. After approved environment/secret setup, the platform pipeline is enabled through `LZC_PLATFORM_CI_ENABLED`.

<a id="vorfall-2026-09-30-erster-plattform-apply-unvollständig"></a>
## Incident 2026-09-30: first platform Apply incomplete

- [x] Secrets transferred to both platform environments with explicit user approval; values not logged.
- [x] CI plan and encrypted artifact checked: commit `3322dd99a37a495fda8ba46fc4eb6284895d4316`, nine Create, no Update/Delete; hash and run association checked.
- [x] [Validation 36632950763](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36632950763) successful.
- [x] Approved Apply started: [run 36632950493](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36632950493).
- [ ] Complete platform Apply successfully: job aborted by GitHub after 45 minutes (`maximum execution time of 45m0s`).
- [x] One-time variable `LZC_PLATFORM_APPLY_COMMIT` removed and `LZC_PLATFORM_CI_ENABLED=false` set; no automatic retries.

Direct API check after the abort: PostgreSQL `lzc-dev-db` moved from `PENDING` to `PROGRESSING`; Secrets Manager `lzc-dev-secrets` reported `Running`, the CF organization `active`. This demonstrates a partial inventory, not completeness of all nine resources or application usability. Server-side database provisioning continues independently of the terminated Runner.

The expected platform state in the workload bucket is absent (`NoSuchKey`). The object version list likewise contains no platform state, but a remaining `.tflock` object. This is no substitute for state and was not removed. No further Apply was started. The original plan must not be reused: it plans new resources and is unaware of the partial inventory now present.

<a id="wiederaufnahme-und-abnahme-abgeschlossen-details-unten"></a>
### Resumption and acceptance (completed, details below)

- [x] Check PostgreSQL final state through the API (`READY`); if provisioning remains stuck, request STACKIT service diagnostics using the instance ID from the local inventory.
- [x] Create a full inventory of all nine planned resources, including technical users and Model Serving token; protect IDs and credentials.
- [x] Perform state recovery through a dedicated, serialized CI path: import existing importable resources, rotate unrecoverable one-time credentials in a controlled manner. No duplicate creation or unchecked deletion.
- [x] Handle remaining lock only after checking that Runners have terminated and before controlled recovery; native S3 locking remains documented as unreliable.
- [x] Improve CI process control: timely orderly OpenTofu termination before the outer job time limit, protected diagnostics and encrypted recovery artifacts. Merely increasing the timeout does not repair missing state.
- [x] Review a fresh plan after recovery; only then re-enable platform CI and set new specific Apply approval.
- [x] Independently verify encrypted remote state, complete resources and subsequent no-op plan.
- [ ] Create CF runtime (space, apps, bindings, separate runtime identities) through IaC and test PostgreSQL/Secrets access from CF.

<a id="erfolgreiche-recovery-und-plattform-abnahme"></a>
## Successful recovery and platform acceptance

Commit `1843069ce6914c26d04a7461d0799fc1c58794d7`, [run 36675347654](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347654): recovery, Plan and Apply successful. [Validation run 36675347681](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347681) also successful.

Six existing resources were imported without recreating instances, CF organization or artifact bucket. The orphaned Model Serving token was revoked. The freshly reviewed plan created the database, migration user and new Model Serving token; CF manager and Secrets provisioning user were replaced because their passwords had been lost. The PostgreSQL update concerned computed flavor metadata, with unchanged flavor ID and infrastructure parameters.

Independent acceptance:

- [x] Encrypted state object present in the workload bucket; nine managed resources checked.
- [x] Both separate network ACLs match the planned networks.
- [x] PostgreSQL `READY`, database `configurator` with owner `configurator_migration` present.
- [x] CF organization active and Secrets Manager `Running`.
- [x] New technical users and exactly one new active Configurator Model Serving token confirmed in the API; old identities replaced.
- [x] Required passwords and token present in encrypted state without outputting values.
- [x] Protected diagnostics and state snapshot downloaded from GitHub; authenticated decryption and JSON integrity checked.
- [x] Both one-time variables `LZC_PLATFORM_RECOVERY_COMMIT` and `LZC_PLATFORM_APPLY_COMMIT` removed. Platform CI active again for Plan runs.
- [x] Confirm final plan without changes: [run 36675895279](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675895279), all nine resources `no-op`; recovery/Apply skipped. Commit, run and plan hash independently checked. [Accompanying validation](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675895374) successful.

Platform jobs now have an outer time limit of 100 minutes. OpenTofu Apply receives at most 70 minutes followed by up to ten minutes for orderly termination; an additional overall script runtime limit leaves a buffer for artifacts. 22 local tests, including termination behavior, encrypted diagnostics and recovery guards, and workflow checking passed.

Next expansion: CF space and app/task runtime through IaC, separate runtime identities/bindings and real TLS/authentication tests from CF. Infrastructure acceptance does not yet demonstrate successful app access to database or Secrets Manager.

<a id="ci-vereinfachung-2026-09-30"></a>
## CI simplification 2026-09-30

Workflows now run OpenTofu directly. The previous deployment Runner, process manager and automatic one-time recovery path have been removed. Normal Plan/Apply logs appear live; credential outputs and state snapshots remain specifically protected. GNU `timeout` handles SIGINT and the subsequent grace period; no custom signal control. Applicable time limits and commands are in the [CI operations guide](../infra/ci/README.md). The historical recovery inventory is under `docs/incidents`, without active execution.

Acceptance of the direct CLI pipelines: bootstrap run 36677111141 and platform run 36677111032 successful, both `No changes`, Apply skipped. Normal init/plan details are visible live. Logs checked against known deployment credentials and state keys, no matches. Validation 36677111055 successful, including the GNU timeout test in all five Linux matrix jobs. No infrastructure change from this restructuring.

Backend acceptance of the restructuring: [run 36677367229](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677367229) planned root `backend` with separate management/workload credentials: `No changes`, Apply skipped. Root, commit, run, plan hash and encrypted artifact checked. Native logs visible and free of known credential values. [Validation 36677367252](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677367252) successful. Temporary root selection removed; no Apply approvals set. Bootstrap, backend and platform have thus been checked read-only, without cloud Apply or state migration from the restructuring.

<a id="cf-runtime-und-erster-app-release-2026-09-30"></a>
## CF runtime and first app release (2026-09-30)

- [x] Separate runtime root with encrypted S3 state and Cloud Foundry provider 1.17.0.
- [x] Space `configurator`, explicit `organization_user` membership and `space_developer` role created.
- [x] Dedicated PostgreSQL login role `configurator_app` and Secrets Manager user with read-only permission.
- [x] [Runtime Apply 36681789484](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36681789484) successful; five resources independently confirmed in encrypted remote state.
- [x] Web/API deployed through separate release workflow with direct `cf` commands; Model Serving token only in backend environment.
- [x] [Release 36682016739](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36682016739): build and CF push successful, application started. Native CLI logs checked for known credential values: no matches.
- [ ] PostgreSQL connection: first CF task fails after 15 seconds; network/TCP diagnostics to follow.
- [ ] Secrets Manager: first CF task receives HTTP 403 at login; according to [STACKIT diagnostics](https://docs.stackit.cloud/products/security/secrets-manager/how-tos/handle-authentication-lockouts/), an indication of a source-IP ACL.

The first runtime Apply created the space and users but failed because CF organization membership was missing. State remained fully intact. A fresh plan added only the two missing roles; no import or credential reset was required.

The CF foundation permits public targets in its global `public_networks` security group. This is not yet evidence for each service path. Furthermore, the two STACKIT networks used so far do not cover the current public address catalogue. The official API `GET /v2/networks/public-ip-ranges` returns regional networks; changes are assessed using the real CF test and a new IaC plan. No observed individual IP is promised as stable CF egress. Source for the current catalogue: [STACKIT IP ranges](https://docs.stackit.cloud/products/logging-and-monitoring/logme/how-tos/create-and-manage-logme-services/).

<a id="nachgewiesener-acl-fehler-und-korrekturplan"></a>
### Demonstrated ACL error and correction plan

The diagnostic task in [release 36682707060](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36682707060) resolves the PostgreSQL host correctly but cannot establish a TCP connection. An HTTPS call from the same CF task to its own Configurator route returns HTTP 200; the corresponding CF router log entry shows a source from `45.135.244.0/22`. This eu01 network is in the current STACKIT IP catalogue and is also listed as a STACKIT standard network in the [STACKIT LogMe FAQ](https://docs.stackit.cloud/products/logging-and-monitoring/logme/faq/). It was missing from both explicit ACLs.

The new IaC plan therefore adds exactly `45.135.244.0/22` to the separate PostgreSQL and Secrets ACLs. The observed individual IP is not configured. This remains an allowance for a shared STACKIT network, not a tenant-owned or guaranteed stable CF outbound address. TLS, user permissions and subsequent tenant authorization remain separate protection layers. When networks change, recheck the catalogue and CF test; no automatic opening of further networks.

<a id="abnahme-cf-hosting-und-dienstverbindungen-abgeschlossen"></a>
## CF hosting and service-connection acceptance completed

[Release 36683898762](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36683898762) on commit `795a18a`: **fully successful**. [Validation 36683898795](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36683898795) also successful (app with nine tests and all six IaC roots).

- [x] [ACL Apply 36683137454](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36683137454): two in-place updates, no creation/deletion. Both service ACLs independently checked in encrypted remote state.
- [x] App `landing-zone-configurator` started in space `configurator`; declarative manifest under `deploy/cloud-foundry/`.
- [x] PostgreSQL: DNS and TCP reachable, runtime user authenticated, `SELECT 1` and `pg_stat_ssl` successful, certificate/hostname verification active.
- [x] Secrets Manager: TLS and userpass login successful; reserved KV path denies anonymous access and accepts the authenticated call; session token subsequently revoked.
- [x] CF tasks `network-36683898762` and `connections-36683898762` are `SUCCEEDED`.
- [x] HTTPS home page and JavaScript asset served; `/healthz` HTTP 200, `/api/v1/session` HTTP 401.
- [x] All ten backend variables compared with encrypted runtime outputs; no project/S3/CF deployment credentials in the app.
- [x] Successful runtime/ACL/release logs checked for known keys, passwords and tokens, without matches.
- [x] One-time runtime/platform Apply variables removed; feature branch retained, no merge to main.

Secrets Manager does not support the general Vault system API `sys/capabilities-self` (HTTP 404 in the test). The final test uses the [documented KV read endpoint](https://docs.stackit.cloud/products/security/secrets-manager/how-tos/cli-and-api/) with an anonymous negative test. For the deliberately uncreated operator probe key, authenticated HTTP 404 is permitted; HTTP 404 without a token would also cause the test to fail. No customer secrets are read and no probe secrets are created. **A secret write/read roundtrip, tenant authorization and rotation have not yet been accepted.** The runtime identity is read-only in IaC.

Dev address: [lzc-dev Configurator](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud). The short route will be set up with the next release; the live switch and updated OAuth callbacks must then be checked separately. This is the technical app skeleton. GitHub login, persistent tenant schema, template editor, personal credentials, customer Plan/Apply and chat follow in the [current MVP checklist](planning.md#aktueller-meilenstein-cf-hosting-und-service-verbindungen).

Standing user approval for necessary Configurator Applies is valid until MVP; plan review, environment protection and shared CI concurrency remain active.
