# Project templates: inputs, fixed settings and resource bindings

[English](template-parameters-and-bindings.md) | [Deutsch](template-parameters-and-bindings.de.md)

<a id="projekt-templates-eingaben-feste-vorgaben-und-ressourcenverknüpfungen"></a>

<a id="aktueller-mvp-acl-einrichtung-durch-den-benutzer"></a>
## Current MVP: user-managed ACL setup

As of: 2026-10-08. The Observability ACL is no longer a Configurator parameter. Editor, order form and preview offer neither CIDR selection nor project-network binding. An enabled Observability instance produces no mandatory-ACL-field or egress-qualification blocker. Users configure access sources themselves directly in STACKIT; the Configurator neither determines nor configures an automatic access path.

Saved ACL values and old policies remain in their templates. Old ACL order inputs and policies are ignored during new resolution; existing fixed values remain as compatibility values. No private project network is translated into Internet source addresses.

The new native Application revision `88149782bf8e91dcdbb43a203b54337886023f7f` uses `ignore_changes = [acl]` so subsequent manual ACL changes do not trigger a Terraform change plan. The STACKIT provider still sets the initial ACL value at creation and resends the value it read during other instance updates. A concurrent manual change between Plan and Apply is therefore not protected against overwriting.

New publications use the actively offered Runner revision. Existing published versions, orders and saved plans are not rebound. They require a new publication followed by a new order; old packages and history are retained. The following ACL binding descriptions document the earlier design, not the current MVP.

As of: 2026-10-06. Parameter contract, template editor, tenant-bound test catalogue, persistent orders and server-based applied-platform binding implemented. Live activation and human acceptance, Application cloud Plan and production instantiation remain outstanding. This status is local, not yet published. Supplements [project template drafts](project-template-drafts.md) and the [Platform/Application architecture](platform-application-architecture.md).

<a id="serverbasierte-plattformbindung"></a>
## Server-based platform binding

With capability `appliedPlatformsEnabled` enabled, the Platform Engineer selects a successfully applied platform of their active tenant and has the server precheck its non-secret platform targets. Only completed Applies with a still-matching, unlocked state version and current human evidence for the verified organization are available. The normal path requires no JSON transfer; file import remains only as a compatibility path for older APIs.

The preview provides targets and source evidence comprising Apply ID, state key and version, original contract revision and SHA-256 of the validated document. For explicit approval, the browser sends only this evidence, consent and the selected technical profile ID. Targets and organization come from the server again, not copied browser data. Human evidence, current state and technical access are checked again. Changes during checking prevent adoption. The source remains append-only and tenant-bound; concurrent repetitions with the same checked access are idempotent.

Approval reserves no new cloud execution and changes no existing Application instance. Old orders retain their contract revision; a new platform Apply does not rebind them automatically. The API extension and migration 036 are locally qualified but not part of the running login-only status 034. Group migration 035 and source migration 036 need separate activation. Real Application Plans, explicit Applies, drift and upgrades remain independent follow-up steps in #93. The standalone Accelerator remains independently usable.

<a id="aufgaben-in-der-oberflaeche"></a>
## Tasks in the UI

The editor step **Template drafts** edits unpublished templates. The **Application Landing Zones** page separates further tasks into tabs: **Catalogue** for published versions and order forms and **Orders** for saved instances and their details. Platform Engineers additionally see **Publication** and **Platform binding**; authorized group managers see **Groups**. Application Owners receive no management tabs. Successful publication opens the catalogue; ordering opens its order area.

Platform binding is neither template publication nor cloud execution. The normal, server-based path needs no file upload. For older APIs, the previous upload is collapsed under **Compatibility import**. This accepts exclusively the exported JSON contract of an actually applied Platform Landing Zone, not arbitrary JSON, Terraform state, tfvars or credentials. The contract contains the organization ID and approved target folders with their platform references; the server checks it before explicit approval.

This UI separation is locally qualified. It activates neither migrations 035/036 nor a backend feature or Application cloud execution.

<a id="implementierter-umfang"></a>
## Implemented scope

`ProjectTemplateDraft.parameterPolicy` (version 1) defines the value source for each approved field. The first five fields are stage, Secrets Manager activation, Observability activation, Observability performance class and Observability ACL. Additionally, project roles can be assigned at instantiation through `source: context` and the typed variable `verified-project-owner`. All other settings remain fixed; sandbox parameters are not yet qualified. String inputs need an explicit selection list, ACL inputs a selection of permitted CIDRs; an empty ACL order is blocked. A still-empty required ACL selection list without a preselection may be edited as a draft; preview and resolution remain blocked until valid order input exists. Older fixed settings are not automatically reinterpreted. Defaults, required fields, provenance and prohibited overrides are checked by the same domain resolver used by the Application compiler. This also applies when saving template policy.

New templates allow stage selection; new preset drafts keep the example's stage as preselection, newly added templates use `dev`. Explicit adoption of an existing configuration as a platform copy instead retains fixed settings. JSON in the fork saves the policy; platform tfvars export still contains no template instances.

Under **Test order**, the editor creates a local form from the policy, showing effective values and provenance. This is not a public Application Owner order and performs no cloud access. Published Application contract prototype version 2 accepts this policy and rechecks order inputs, tenant/platform binding and concrete service values. Version 1 remains compatible. Execution remains explicitly disabled.

The project-network binding is stored symbolically and blocked both in preview and natively in the Application root. Its production egress resolution is tracked in [#96](https://github.com/stackitcloud/stackit-landing-zone/issues/96). The Runner pin remains unchanged; these additions do not approve production execution.

<a id="tenantgebundener-testkatalog-und-bestellungen"></a>
## Tenant-bound test catalogue and orders

The `/applications` page separates published versions from editable project template drafts. The server stores the complete validated snapshot with policy, tenant, template ID, sequential version, publisher, timestamp and fixed Accelerator pin. The same snapshot with the same pin returns the same latest version; changes create a new one. Earlier versions are neither changed nor automatically transferred to orders. Sandbox publications and empty order selection lists remain blocked.

Platform Engineers publish from the current draft. Application Owners see only versions of their active tenant and need no personal fork. The personal workspace allows its previous admin to prepare this test catalogue. Unverified organization workspaces may prepare data this way but receive no STACKIT execution permissions. A catalogue version is not yet a resource template verifiably approved for real customers.

The order contains only version ID, project name, permitted parameters and a UUID idempotency key. Tenant and requester come from the server-resolved session; owner email, platform ID and fixed settings cannot be overridden. The same key for the same requester in the same tenant with identical inputs returns the same instance. Different inputs return HTTP 409. The browser retains the key for repetition and network retry of the running order form. A newly opened or modified form is a new order; there is no automatic merging by project name.

Each order receives its own server-side instance ID and reserves `applications/<tenant-id>/<instance-id>/terraform.tfstate` as its state key. Ordering creates **neither a state file nor a STACKIT project yet**. Fixed settings, resolved inputs and qualification blockers are stored persistently. Application Owners see only their own orders; Platform Engineers see orders of their tenant. PostgreSQL enforces RLS, current product roles and immutable versions; switching the active tenant during a request is rejected. A workspace with published versions or orders cannot be archived as an empty draft.

Plan status is always `blocked` and `executionEnabled=false`. The UI identifies missing verified STACKIT user identity, missing approved platform contract and the Application Runner not yet being approved. A GitHub login or service-account key is not reinterpreted as human STACKIT evidence. There are no invented resource counts or Apply action. Unresolved project roles and egress bindings remain additional blockers. This does not present the existing Application compiler as an execution broker.

Migration `010_application_catalogue.sql` and `LZC_APPLICATIONS_ENABLED=true` are required for backend operation; the flag is off by default. The new migration was applied exclusively in the disposable local PostgreSQL test database, not in the CF database. Existing Runner pin, platform contract and deployment pipeline are not automatically extended.

Evidence: domain/API tests, real PostgreSQL session/RLS with an HTTP end-to-end path, concurrent idempotency checks, role revocation and desktop/mobile browser cases. Browser cases use simulated API responses; they replace neither live acceptance with verified STACKIT identities nor a real cloud Plan.

<a id="lokales-projektnetz-als-template-vorgabe"></a>
## Local project network as a template setting

A project network is part of the Landing Zone, not just the later VM application. Public project templates can therefore create a local, non-SNA-routed network with `settings.network_enabled: true`. `network_prefix_length` optionally sets the prefix length; without a setting, the service determines it. Prefix length describes network size: `/24` comprises 256 IPv4 addresses, `/25` 128 and `/26` 64. Larger prefix numbers mean smaller networks; not all addresses are available for VMs. The UI offers these settings directly in the project template. Network creation and size initially remain fixed settings, not order inputs.

Existing Public templates without a network option remain unchanged. Corporate templates retain their automatically created routed network and SNA assignment. Sandbox networks are not covered by this extension. A template for a VM network therefore creates the project and its network, not yet the VM.

Settings are saved with the template document in the fork and create no projects or networks during platform export. Application contract version 2 passes them as fixed settings to the native Application root; version 1 remains unchanged. The module outputs a non-secret network reference. Module, Application and standalone mock plans check local network creation without SNA and preservation of existing configurations. Production instantiation and a real cloud Apply are still not approved.

The local network is not an automatic Observability ACL source. The [instance ACL](https://docs.stackit.cloud/products/logging-and-monitoring/observability/how-tos/control-instance-access/) filters source addresses visible at the Internet endpoint jointly for Grafana, metrics, logs and traces. An empty ACL restores unrestricted network access. Private network CIDRs must therefore not be adopted as source addresses without demonstrated egress semantics.

<a id="kataloge-und-verifizierte-instanziierungsvariablen"></a>
## Catalogues and verified instantiation variables

Loaded STACKIT product catalogues also apply to permitted order values. When exposing the Observability performance class, current options are offered and can be restricted through checkboxes. Existing values no longer in the catalogue remain visibly retained. Without an available catalogue, manual input remains possible; it is not evidence of cloud availability. The same catalogue mapping is used in the structured editor for Git, VPN, SKE, Observability, bastion and the new IAM fields. Not all these platform fields are already qualified as project order parameters.

For project roles, policy defines `source: context`, `variable: verified-project-owner` and a role list. No personal email addresses or freely interpretable placeholders are stored in the template. Local preview shows the unresolved identity and a blocker. The compiler binds exclusively `context.verified_stackit_email`, never GitHub login or a user identifier supplied by the requester. Existing fixed assignments are retained. Duplicate assignments of the same role to the same identity are avoided. Additional role assignments and fixed `custom_roles` are passed through Application contract version 2 to the native root; version 1 remains unchanged. This is still a prototype not approved for production execution.

When Observability is fixed off, the template editor hides performance class, access sources, instance name and corresponding preview values. Saved values and policies are retained and reappear when re-enabled. If activation is selectable only at ordering, required template settings remain configurable. Structured template services with an explicitly disabled `enabled` or named `*_enabled` switch likewise hide their associated details without deleting them.

STACKIT role templates copy name, description and permissions into an editable custom role with an `application-` name prefix. No project-bound role ID from the reference project is transferred. A displayed role is no assurance that the same definition exists in the later target project; it must be defined there as a custom role or qualified as an available target role before publication.

Public project templates with a local network enabled can select the Observability binding as a symbolic draft just like Corporate templates. Without a project network, selection is blocked. The ACL binding is evaluated only when Observability is enabled. If Observability is disabled at ordering, the project network remains; the inactive ACL binding produces neither a resource binding nor a qualification blocker. Template policy remains unchanged. A symbolic snapshot may be stored in the test catalogue; production approval and execution of the active ACL binding remain blocked for both network types without a demonstrated public egress address.

<a id="ausgangsproblem-und-überprüfte-accelerator-grenzen"></a>
## Initial problem and verified Accelerator limitations

Current `ProjectTemplateDraft.settings` mainly preserve concrete Accelerator settings. They distinguish neither fixed policy from overridable defaults nor resource bindings from literal values. The existing Application contract is an unapproved prototype and must be developed accordingly. The UI must not suggest complete parameterization.

- `env` is currently a fixed setting, `dev` for new Public/Corporate drafts. In `src/main.tf`, the value flows into naming and DNS.
- `src/modules/landing-zone/8-observability.tf` passes `var.observability.acl` unchanged. Binding to a created network is missing.
- `src/modules/landing-zone/3-network.tf` still creates a routed network when `corporate=true`, now additionally a local network for Public projects when `network_enabled=true`. Both are module resources; qualify sandbox separately.
- The later ACL must consider the source address effective at the service: a project CIDR may not be the actual visible source address with NAT or other access paths. Product/network semantics must be demonstrated with the provider and a real connection test before execution approval.

<a id="wertquellen-statt-frei-interpretierbarer-platzhalter"></a>
## Value sources instead of freely interpretable placeholders

Each approved business property receives exactly one value source:

| Source | Platform Engineer defines | Application Owner sees |
| --- | --- | --- |
| Fixed | Concrete typed value, e.g. mandatory Secrets Manager | Explained, read-only setting |
| Fill in at ordering | Type, required field, permitted values/limits, explanation, optional default | Input or dropdown within these limits |
| Automatically bound | Approved typed resource reference, e.g. own project network | Relationship and later resolved value, no free-text field |
| From verified context | Server-side identity/tenant/platform binding | Provenance and effective value, no overridable ID |

These are not four options for every field: organization/requester, for example, may come only from verified context; a service performance class can offer only approved values. A server-side field registry determines permitted sources and reference types per target. Unknown fields are not automatically mutable. No arbitrary HCL/JavaScript expressions, string interpolation or executable template scripts.

A default is a suggestion for a permitted order input, not fixed policy. Requirement, admissibility and mutability are separate properties. Secrets are incorporated exclusively through authorized secret references; they are not ordinary template parameters or preview values.

<a id="umgebung--stage"></a>
## Environment / stage

**Selecting a specific stage normally belongs to ordering**. The template defines permitted stages and the preselected one, for example `dev`, `test`, `prod` with default `dev`. A deliberate “production only” offering may fix `prod`. Selection values are template policy, not a claimed exhaustive Accelerator enumeration.

Stage is initially selectable only at creation. Since it affects names and DNS in today's Accelerator, later changes will only be offered with a qualified update contract, visible resource diff and potential replacement impact. No automatic renaming of existing resources. The Application compiler must explicitly represent its concrete effect on naming/labels/DNS; the current Application prototype does not yet fulfill this contract.

<a id="beispiel-stackit-observability-und-eigenes-projektnetz"></a>
## Example: STACKIT Observability and own project network

The Platform Engineer defines:

- STACKIT Observability is created (or optional within defined policy).
- Performance class fixed or selected from approved classes valid for the target.
- Access rule: **Own project network** instead of an invented advance CIDR.
- Reference to the concrete network managed by this instance. With multiple networks, an explicit network or explicitly defined set is required.

The saved template contains a typed reference, conceptually `Observability → Zugriffsquellen → Projektnetz dieser Instanz`. It does not yet contain a CIDR for the requester to enter. Within one state, the compiler translates this relationship into a real OpenTofu resource reference. If the address is unknown during Plan, preview shows “determined at provisioning” with provenance; the dependency graph resolves it at Apply. No advance API resolution against a network that does not yet exist and no CIDR placeholders in tfvars.

If the network is missing or its address type/access path does not match, the combination cannot be published or instantiated. **No silent fallback to empty ACL or `0.0.0.0/0`.** For Observability, an empty ACL means full network-level access. Even a Public template with a local network needs a qualified egress strategy before it can offer “own project network” as an executable ACL source. The binding is selectable as a symbolic draft.

<a id="allgemeine-verknüpfungen-und-state-eigentum"></a>
## General bindings and state ownership

References need resource type, permitted output attribute, tenant/instance or platform scope, and cardinality. Examples include cluster for namespace, SNA for Corporate network, target folder for project, Observability connection and verified requester for an approved IAM assignment. Not all these bindings are already supported by the Accelerator.

References within an instance are connected in the OpenTofu graph. Platform references come from a checked contract version, never arbitrary foreign state files or user UUIDs. Resolution checks tenant, region, type, permission, existence and lifecycle; cycles are rejected. A template must not access foreign tenants through a parameter.

A shared platform instance remains in platform state. If an Application would need to extend its ACL, its state must not also manage that ACL. This requires a separate authorized registration/deregistration workflow with the platform owner, including concurrency and rollback on deletion. Until that exists, the combination is not approved for execution.

<a id="veröffentlichung-bestellung-und-änderungen"></a>
## Publication, ordering and changes

1. Editor: visible source per approved field and constraints for order inputs.
2. Publication: check types, defaults, binding graph, mandatory dependencies and compiler/Accelerator capabilities; create immutable version.
3. Ordering: generate form exclusively from the approved input schema.
4. Server: reject unknown/blocked inputs, recheck permitted values, bind context and compile deterministically. The same applies to chat/API.
5. Plan: show concrete values and still-unknown resource values with provenance. Bind Plan/approval to template version, inputs, platform contract and compiler.
6. Update: allow only inputs explicitly qualified as mutable; template upgrades remain explicit. Template changes do not change instances.

Template policy, order inputs and resolution evidence are persisted separately. Every effective field has provenance. Existing drafts initially retain their values as fixed settings; the Platform Engineer explicitly makes them order inputs or bindings. No automatic release of previously blocked values.

<a id="umsetzungsreihenfolge--abnahme"></a>
## Implementation sequence / acceptance

- [x] Gap and concrete Accelerator limitations checked in code.
- [x] Implement versioned parameter/binding contract with five approved fields (#92); other fields remain fixed.
- [x] Stage as the first complete order input with default, selection and fixed values; unchanged reading of old drafts, explicit conversion.
- [x] Generate template editor and local order preview from the same contract.
- [x] Connect published tenant catalogue (#92/#93); real immutable version 1 accepted locally.
- [ ] Accept a real Application Owner order followed by Plan/Apply (#93).
- [x] Compiler checks policy independently of the form for manipulated inputs; tests for unknown fields, invalid defaults, tenant switches and version binding.
- [ ] Extend Accelerator module with typed project-network/Observability binding; first demonstrate provider/ACL/egress semantics, then native graph/plan tests.
- [ ] Missing network, disabled source service, multiple networks and cyclic or cross-region bindings prevent publication/instantiation.
- [ ] Qualify Plan with unknown resource values and later correct ACL; real customer Apply exclusively after explicit approval.
- [ ] Add further service bindings following the same pattern; release shared platform ACLs only after implementing single-state ownership.

This work is a prerequisite for usable Application self-service, not a later convenience enhancement to an already complete MVP.

<a id="validierung-und-bereitstellung"></a>
## Validation and deployment

- Local domain/app tests and native Application mock plans check the new policy and stage naming, legacy preservation and the hard network-binding block.
- Browser checking and release evidence will be added after successful deployment.
- No customer Apply or automatic change to existing projects.

<a id="reale-template-veroeffentlichung-2026-10-06"></a>
### Real template publication (2026-10-06)

The existing Public template was published as version 1 from the saved draft: region eu01, local project network, approved server-based platform contract, target `public-eu01`, automatic group **Application Owners** and **Deployment with approval**. The contract comes from the successful current platform Apply with state version 6; old Applies and raw states are not freely selectable sources. The catalogue shows the same version after reload. Publication creates no cloud resources; Application execution remains disabled. A real Application Owner order and cloud execution have therefore not yet been accepted.

Custom groups are created, populated with members and deleted in **User management**; publication manages only their template access. **Successful platform Apply** shows configuration name and completion date instead of a state-key hash. Only successful, current, unlocked Applies in the verified workspace with valid human organization evidence are selectable. Renewing this evidence remains accessible in user management even after organization binding.
