# Platform configuration and project template drafts

[English](project-template-drafts.md) | [Deutsch](project-template-drafts.de.md)

<a id="plattformkonfiguration-und-projekt-template-entwürfe"></a>

As of: 2026-10-09. Order, Plan, Apply, Destroy and drift workflow.

<a id="application-destroy-und-drift"></a>
## Application Destroy and drift

Order details offer **Destroy** and **Drift** when the active, qualified Application Runner package explicitly supports these operations. Existing template versions, orders, sources, artifacts and state keys remain unchanged. Both actions use the S3 state of the same Application instance.

**Create Destroy plan** uses `tofu plan -destroy` to create a saved deletion plan. After resource review and separate deletion confirmation, exactly this binary is applied, not a newly calculated plan. The API binds confirmation to the instance and artifact hash; changing the plan/tab resets UI confirmation. Creation, modification, replacement and folder deletion remain blocked. Final status and redacted execution logs are available in the Destroy tab. After successful Destroy, the order can be archived separately; state, artifacts and audit history are retained. Provider-side project deletion may still have a subsequent purge phase.

**Check drift** creates a read-only plan with explicit refresh and shows two separate comparisons: saved state versus cloud and cloud versus the immutably ordered desired configuration. Sensitive attributes are masked. The check cannot be applied through either UI or API/worker. Only resources of this Application state are covered, not arbitrary additional resources in the project. Drift is therefore not a complete cloud inventory.

Current requester/IAM/group permissions, technical delegation, a matching Runner package and state locking remain required. Active executions and unresolved recovery state block maintenance. A completed `reconciliation_required` with an expired ticket and no recovery evidence specifically permits Destroy/drift, but not restarting a normal Apply. The old completion is neither changed nor interpreted as success. Archived orders still cannot be executed.

<a id="observability-ohne-acl-parameter"></a>
## Observability without ACL parameters

In the MVP, ACL setup is entirely user-managed and not part of the editor, order or automatic resource binding. Observability can be enabled without mandatory ACL inputs or unresolved egress binding. Saved fixed ACL values are not deleted. The new native Application revision protects subsequent ACL changes through `ignore_changes`. Details and provider limitations are in the [current parameter contract](template-parameters-and-bindings.md).

Already published versions remain bound unchanged to their old source. The new Runner requires a new publication and order; existing orders and plan artifacts are not rewritten.

<a id="application-bestellung-vorschau-und-apply"></a>
## Application ordering, preview and Apply

An order without a requested Apply can be deleted even after a successful or failed, completed Plan. Running or unresolved executions and any Apply request continue to block deletion. Deletion removes the order from self-service; job history and encrypted plan artifacts remain unchanged. No Apply can then be started from these plans. Deletion is not cloud Destroy.

For a directly approved template version with active execution delegation, **Order** starts the cloud Plan immediately. Separate confirmations for Plan preparation and Plan start are no longer needed. Business order approval remains necessary only for `approval-required`; afterwards, the Application Owner starts the Plan with one click. The order is retained even if Plan startup fails and can be continued without ordering again.

A successful Plan provides a resource preview from the encrypted, saved plan artifact: resource type, specific change and permitted properties such as project name, region or network CIDR. Sensitive values are masked; unknown values are shown as known only after Apply. Raw plan JSON, secrets and dynamic resource addresses are not output.

**Create Application Landing Zone** starts Apply of exactly this saved plan with one click, without another checkbox or approval loop. Hash, Runner package, order, current plan and execution delegation are checked again. The plan must have been created within the last hour; the same plan can be applied only once. A new short-lived Runner authorization is created for Apply, rather than reusing Plan authorization.

Apply never runs automatically. A potentially partially executed Apply is blocked as `reconciliation_required` and is not automatically restarted. Preview, and therefore Apply, is currently available for the qualified local Runner; a Runner without secure saved-plan inspection reports Apply as disabled. Earlier notes about a Plan-only path or Application Apply not yet being available are superseded by this status.

<a id="fachlicher-ablauf"></a>
## Business workflow

The **Template drafts** tab under **Application Landing Zones** shows the existing
configuration Assistant directly above the template editor. It uses the same saved
configuration ID, conversation and root draft as the configuration editor. Name the
template you want to change and review the proposed fields before accepting them.
Acceptance changes the local draft; save explicitly before platform binding or
publication. It does not publish a version or authorize execution. Application Owners
do not see this configuration chat or gain access to platform configuration data.

The Platform Engineer defines central platform services and the infrastructure projects required for them. Under **Application Landing Zones → Template drafts**, they create templates for future application projects. Platform configuration does not create those projects itself. The Application Owner later orders an instance of a published template version in separate Application self-service.

The configuration editor no longer contains a separate template step. Template drafts remain part of the saved configuration; switching views does not save changes automatically. Existing combined configurations retain the **Projects (existing)** step. Old links to the template step open Application Landing Zones. Local template drafts can still be edited without signing in; publication and ordering require authentication.

New drafts from all eight Accelerator templates use this workflow. `landing_zones`, `sandboxes` and `landing_zone_namespace_services` from the examples become template drafts. Platform, connectivity, governance, central services and their projects remain part of platform configuration. The preview shows platform resources and template drafts separately.

A template contains its own ID and key, display name, project type (Public/Corporate/Sandbox), region and fixed module/service settings. Corporate templates reference an SNA in their region. Project type determines the folder role. Secrets Manager and Observability can be specified as automatically provisioned services; other supported module values are retained. This describes an application project with basic services, not yet an independent VM or Kubernetes workload offering.

The specific project name and abbreviation belong to the later order. The project owner must come server-side from a verified STACKIT identity. Fixed additional administrator assignments (e.g. sandbox `owner_emails`) are separate platform policy; example addresses must be cleaned up before saving. Namespace service settings are retained as template metadata. This does not approve their later cluster binding/execution.

For an Assistant request limited to local-network templates with delegated naming,
the saved platform region and exactly one same-region Corporate network area
resolve the essential choices. The server supplies those existing defaults and
the answer schema permits no redundant questions about technical keys or optional
subnet settings. Public-only templates do not need a Corporate area. Missing or
ambiguous areas, an unset region, undelegated naming and additional service choices
retain the normal question flow. A model response that violates the closed
question contract is rejected, not silently trimmed. Proposals still require
explicit acceptance and saving; they grant no publication or execution.

## Adding project permissions

Under **Application Landing Zones → Template drafts → Application access profile**, the workload profile's 144 permissions are the default selection, not a maximum. The complete project catalogue also includes Kubernetes, databases and IAM. For example, search for **Kubernetes**, open **Kubernetes (SKE)** and select individual permissions or **Select all displayed**. Requester and Application service account lists are edited separately; group actions change only the filtered, displayed permissions.

Live data supplements the complete bundled catalogue. Identifiers no longer listed live, and unknown imported identifiers, are never silently removed. Before publication, new identifiers outside the static catalogue must be confirmed by the official catalogue retrieved server-side; publication is blocked without confirmation. The catalogue describes possible permissions, not a person's effective permissions or product activation.

For example, ask the Assistant: “Add Kubernetes cluster management permissions to template central.” It adds official SKE permissions while preserving existing permissions, the central owner and other settings. Without a distinction it adds to both lists; “requester only” leaves automation unchanged. Acceptance, saving and a new publication remain explicit separate actions. Existing versions and orders are unchanged.

SKE project permissions manage clusters; Kubernetes RBAC inside a cluster is a separate mechanism. The management set includes `ske.cluster.kubeconfig.create`, which permits obtaining admin kubeconfigs and therefore cluster administrator access. Additional IAM role/member administration can enable privilege escalation and is not selected by default. Such permissions and full Owner rights remain deliberate customer choices. See [STACKIT custom roles](https://docs.stackit.cloud/platform/access-and-identity/roles-permissions/custom-roles/) and [SKE cluster access](https://docs.stackit.cloud/products/runtime/kubernetes-engine/getting-started/access-cluster/).

<a id="template-eingaben-und-verknüpfungen"></a>
## Template inputs and bindings

The previous fixed settings do not yet constitute a complete template contract. Stage should normally be a bounded order input; service relationships such as “Observability only from the project's own network” need typed bindings. [Value sources, instantiation and implementation plan](template-parameters-and-bindings.md). Parameter policy, five approved fields and local order preview are implemented. Publication, further field bindings and real orders remain outstanding.

<a id="speicherung-und-export"></a>
## Storage and export

The existing v3 document format now has optional `projectTemplates`.

- Without the field, it remains an existing combined configuration with concrete projects.
- With the field, it is a platform draft; even an empty list identifies this mode.
- Platform drafts must not contain concrete `landing_zones`, `sandboxes` or `landing_zone_namespace_services`. Mixed forms are rejected during reading, saving and export.
- Template settings are checked against the existing Accelerator input contract; concrete instance/owner fields are prohibited in template settings.
- JSON in the personal fork retains template drafts. Deterministic tfvars export contains only the platform and explicitly empty application collections.
- Initial-provisioning plans for permitted platform subsets therefore plan **only the platform**, not template instances. Other Runner guards remain effective.

The optional field preserves readability of old documents without automatic reinterpretation. Publication will later receive its own tenant-bound, immutable version contract; an editable fork draft is not a published version or provisioning authorization.

<a id="bestehende-konfigurationen"></a>
## Existing configurations

The previous project editor remains available for existing documents under **Projects (legacy)**. New configurations are no longer created through the old standalone creation button.

**Adopt as new platform configuration** creates a copy with a new configuration ID after explicit confirmation. Fork binding is reset to new creation; the existing record is not overwritten. Namespace settings without an associated source project block the copy rather than being lost. SNA references from templates prevent accidental removal of the referenced area.

This is exclusively a configuration copy. It is not a state migration, import of existing resources or instruction to roll out the platform again in parallel. Existing resources require the separately planned migration/state lifecycle.

<a id="bestellfreigabe-2026-10-07"></a>
## Order approval (2026-10-07)

Under **Application Landing Zones > Orders > Show details**, a Platform Engineer can approve or reject another person's order with `approval-required`. The decision must be explicitly confirmed; rejection requires a reason. Self-approval is blocked.

Migration 040 stores decision, decision-maker, time and reason as immutable, tenant-bound evidence. Repeating the same decision returns the same evidence; a contradictory decision is rejected. The requester sees the status and reason for their own order. Existing orders without evidence remain pending; `direct` requires no order approval. The published template version is retained.

Business approval starts neither a Runner nor a cloud Plan or Apply. Runner activation is separate. New jobs, credential grants, claims, dispatches and Runner tickets for orders requiring approval are blocked in the database as well unless positive decision evidence exists. Existing credential, backend, identity and execution checks are retained.

Qualified with real PostgreSQL role/tenant tests and desktop/mobile browser cases. A private restore of local schema 039 was migrated to 040 twice; all 37 previous business/auth tables remained unchanged.

<a id="application-plan-im-ui-2026-10-07"></a>
## Application Plan in the UI (2026-10-07)

After order approval, the requester can **Confirm Plan preparation** and **Prepare Plan** in order details. This creates a short-lived, idempotent Plan job for their own order; it does not start a Runner or execute a cloud Plan.

The technical Platform Engineer bound in the platform contract sees this job in the same order details. They select an already registered **State backend** and confirm its release. The state key remains the immutable Application instance key, not the platform state key. A separate click after **Confirm cloud Plan** starts the isolated Application Plan Runner. Technical release and startup remain bound to the same session.

The UI reads the actual server capability rather than treating blocking notices stored at ordering as current Runner status. Running jobs are refreshed. Reloads trigger no mutations. A lost Prepare response or an error in the subsequent status request uses the same idempotency key on retry. Expired jobs can be prepared again.

Migration 041 adds only SELECT visibility for the already bound technical approver. Foreign tenants and unbound Platform Engineers receive no jobs; INSERT, credential, backend and dispatch gates remain intact. The job list contains no keys, raw states, plan artifacts or Runner output, only status and the validated plan summary.

Locally, the separately qualified Application package is connected through `LZC_APPLICATION_EXECUTION_ENABLED=true` and `LZC_APPLICATION_RUNNER_PACKAGE_DIR`. The existing platform package remains unchanged. **Application Apply is not yet implemented**: `applyEnabled=false`, no automatic creation after order approval or successful Plan. This rollout did not start a real cloud Plan.

Qualification: 31 real PostgreSQL tests, 16 new desktop/mobile Plan cases, the full organization browser run with 60 cases before the additional GET-failure test, and 412 canonical unit tests passed. A private restore from 040 was migrated to 041 twice; the contents of all 38 existing tables remained unchanged. In the running local rollout, the order decision was retained; normal re-login added a session and renewed only verification time and validity of the existing STACKIT identity.

<a id="aktueller-katalogstand-2026-10-06"></a>
## Current catalogue status (2026-10-06)

Tenant-bound publication, immutable versions, approved user inputs and forkless Application Owner orders are implemented. At publication, Platform Engineers select `approval-required` (default) or `direct`. Policy belongs to the immutable version and is copied into the order server-side; changing policy creates a new version. Clients cannot override it at ordering or in Plan input.

Explicitly confirmed retirement creates immutable, idempotent evidence. Retired versions disappear from AO selection; new orders are blocked server-side as well. Existing instances and idempotent order repetitions are retained. Concurrent ordering and retirement use the same transactional lock. Republishing retired content creates a new version instead of reviving the old one.

The bilingual publisher UI uses explicit API capabilities. The running customer API uses migrations through 034. Group access from migration 035 is qualified on an isolated test database but is not yet activated in the customer API. `direct` enables neither cloud execution nor automatic Apply; explicit customer Apply approval remains necessary.

<a id="gruppenfreigaben"></a>
### Group access

Every workspace automatically receives the default group `Application Owners`. Application Owners are added automatically on joining or role change; their group memberships are removed on role revocation. The default group cannot be edited manually. Migration 035 assigns existing publications to this group; version content, sources and instances remain unchanged.

Group creation and membership changes require current workspace member-management permission. Custom groups accept only Application Owners from the same workspace. Platform Engineers select access groups when publishing or confirm a separate change to access for an existing version. An empty access list blocks the version for Application Owners without deleting their instances or state.

Group access is an audited usage permission, not part of immutable version content. AO catalogue and new orders are filtered server-side. Current permissions are also checked before job preparation, backend release, grant claim and Runner ticket consumption, and before and after secret/backend access. Revoking group access during credential access prevents returning the secret. AOs receive neither group management nor technical credentials. API mutations require tenant binding, Origin and CSRF.

The UI enables these controls only with `groupAccessEnabled`. Tests cover default membership, restricted groups, foreign users, direct SQL claims/tickets, revocation during secret access and desktop/mobile operation. This is not yet acceptance of Application Plan/Apply, drift or upgrades.

<a id="noch-offen"></a>
## Still outstanding

<a id="neue-runner-bindung-und-loeschung-vor-ausfuehrung-2026-10-07"></a>
### New Runner binding and deletion before execution (2026-10-07)

New template versions can use the qualified Accelerator revision offered by the Application service. Publication shows the revision and requires explicit confirmation for each new version. Existing versions and orders are never rebound automatically. Unsupported legacy revisions receive a specific error message when attempting a Plan instead of an apparent service outage.

Requesters can delete their own orders, and Platform Engineers visible orders of their workspace, with explicit confirmation. This requires that no dispatch, Runner ticket or credential claim exists yet. Prepared jobs and backend releases alone do not prevent deletion; after deletion, however, they must no longer be executed.

Migration 042 adds an immutable, tenant-protected deletion marker. The order disappears from the list; version content, approvals and idempotency history are retained. Replays do not create a new order. Shared row locks serialize deletion and execution releases. Neither cloud resources nor Terraform state are deleted. Handling already executed orders and Application Apply remains outstanding.

[#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) remains open for production publication acceptance under authoritatively verified tenant binding. Private drafts are not shown in the AO catalogue.

[#91](https://github.com/stackitcloud/stackit-landing-zone/issues/91) and [#93](https://github.com/stackitcloud/stackit-landing-zone/issues/93) provide verified organization/user binding and instantiation with separate state. The existing customer Apply block remains.

<a id="delegierte-application-plan-ausfuehrung-2026-10-08"></a>
### Delegated Application Plan execution (2026-10-08)

In the publication area, the Platform Owner sets up execution with a registered state backend once per approved platform contract. Authorization immutably binds the contract's service account, credential version and key ID, as well as backend identity and encrypted backend credentials. Existing contracts receive no automatic delegation.

New Plan jobs for a template version bound to this contract inherit this authorization and the instance-specific state key. The Application Owner explicitly starts the Plan themselves, without a second technical backend release and without an active Platform Owner session. For `approval-required`, prior business order approval remains required; `direct` does not need it. Old jobs and template versions are not rebound retroactively.

The Platform Owner can revoke authorization. Before further Runner access, current roles, requester identity, group access, credential and backend binding are checked again. A new delegation does not reactivate old jobs. Secret and backend credentials stay server-side and are issued only once to the bound Runner. New publications adopt the offered, qualified Runner revision without an additional mandatory checkbox.

Application Apply remains unimplemented. A successful Plan creates no cloud resources and is not Apply approval.

<a id="prüfungen"></a>
## Checks

- [x] All eight source templates are converted without loss of platform/project policy.
- [x] Personal instance fields do not enter project templates.
- [x] Legacy documents remain unchanged on reading; copies require a new ID.
- [x] Git storage retains metadata; tfvars and deployment preparation contain no projects generated from it.
- [x] Mixed template/instance documents are rejected.
- [x] Native OpenTofu variable checking confirms empty application, sandbox and namespace collections in platform export.
- [x] Browser checks including legacy copy/save successful; CI validation and [release 36855011827](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36855011827) for `0e62c5e` successful. Live SPA serves HTTP 200 with the expected bundle `index-bjLShEoG.js`.
