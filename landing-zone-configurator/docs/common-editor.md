<a id="gemeinsamer-editor"></a>
# Common editor

[English](common-editor.md) | [Deutsch](common-editor.de.md)

As of 2026-10-15. Publication on `lzc-dev` exclusively from the feature branch.

<a id="bedienung"></a>
## Usage

A valid app session and current STACKIT identity proof are
separate: the app session lasts eight hours, while
STACKIT proof can expire earlier. Name and **Sign out** still mean
you are signed in to the Configurator. If current proof is missing,
the header offers **Confirm STACKIT**, not another **Sign in with STACKIT**.
The dialog explains that confirmation is needed for protected
STACKIT actions. Proof expiry does not sign you out of the app;
it also does not extend any cloud permission. Without an app session,
**Sign in with STACKIT** remains the actual login.

1. Open any template and choose **Create configuration**.
2. **Foundations → Folders → Network → Platform → Operations → Review**.
   Edit templates exclusively under **Application Landing Zones → Template drafts**;
   they remain part of the same saved configuration.
3. Expand settings only when needed. **Use Accelerator default** removes the
   custom setting and uses the engine default, not the template value. Export still contains only explicit inputs;
   displayed defaults are not materialized merely on opening.
4. Under **Application Landing Zones → Template drafts**, add Public, Corporate or Sandbox.
   Existing combined configurations retain concrete project management under **Projects (existing)**. Public/Corporate
   can be switched after confirmation. The target folder is shown.
   Corporate needs a matching region and an existing area.
   Sandboxes have their own Accelerator contract; switching to a
   Landing Zone requires deliberate recreation and removal.
5. **Review** shows known configuration errors and separate execution limitations.
   Then download tfvars or save JSON and tfvars together to a fork.

Single areas from old Hub & Spoke templates can be converted to an area list
with **Manage multiple network areas** without changing the `default` reference.
Areas with project, DNS, firewall, VPN or cluster references cannot
be removed accidentally. Organization tree and network assignment
use the same data; one hub project is shown per network area.

New Standalone drafts explicitly mark the example project as Public
(correction for #84). Lossless import and existing documents remain
unchanged; explicitly set the project kind to **Public** in an older affected draft.
Replace template placeholders with your own organization ID and owner email addresses
as before.

**Platform** contains Git service, platform Kubernetes, central Observability
and audit logging. Kubernetes is disabled with an empty cluster list,
Git service with `null`. Removing configured services requires confirmation;
remaining namespace dependencies are reported during configuration validation.
Observability is a separate service. Audit logging creates a Telemetry
Router targeting STACKIT Logs and an S3 archive. The management archive bucket exists
even with audit logging disabled.

In configuration chat, the change proposal shows structured values with
domain labels and their values, for example **Retention (days): 90**
for audit logging. This also applies to original values, nested objects,
lists and the conflict dialog. Empty lists (`[]`) and objects (`{}`) remain
distinguishable from **Unset**. The **Complete replacement** notice means
the entire proposed setting is adopted, not just individual
subfields. Selection, explicit acceptance and separate saving remain
unchanged; a preview changes neither configuration nor cloud resources.

<a id="assistant-und-application-templates-dev-release-vom-2026-10-15"></a>
### Assistant and Application templates (dev release of 2026-10-15)

New template proposals must contain name, kind, region and settings
together. Existing templates remain partially editable. For platform drafts,
the Assistant receives existing network-area keys and regions, not
cloud resource identifiers. Template decisions reference an existing
user message; the server supplies its original text.
The resulting settings scope bounds the closed
model output schema: a network-only request offers no Observability,
Secrets Manager, namespace-service or parameter-policy settings.
Explicitly requested additional settings remain supported; the full
import, storage and runtime contract is not restricted.
The proposal comparison in the web UI reads templates from the same
ID-free projection indexed by stable keys as the backend,
not as supposed Terraform input. Acceptance updates the local
draft; only explicit saving persists templates.
Invalid generated template structures are reported as failed
Assistant proposals, not credentials in user text.
Saved chat and configuration remain unchanged on rejection.

Using the referenced user request, the Assistant distinguishes
additions, corrections and a desired complete set of templates
or DNS zones. A definition “Corporate and Public, no Sandbox” defines a set,
not automatically an addition alongside initial examples.
An explicitly additional template or zone remains additive.
DNS corrections use existing stable zone keys; ambiguous
targets require clarification.
On set replacement, the proposal list shows every removed entry with
“Remove entry” and its own checkbox. Deselected entries and independent
intervening additions remain. Intervening changes
to a selected entry still require conflict confirmation.
Retained templates keep their IDs and unrequested settings.
Remaining proposals after partial acceptance are assembled from the current candidate.
Already accepted entries survive later
acceptance of remaining deletions, both in the local preview path
and direct revision-checked saving through the API.
None of these changes automatically saves or deletes customer configurations.
The improvements were committed and pushed as source `045eeafb9813e542f59062139d386b819a3792df`
and published through successful
[dev release 38782981970](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38782981970).
Approval followed normal protected dev gates.
Local regression consists of 718 passing unit tests (57 skipped),
51 isolated PostgreSQL Plan/broker tests, 53 PostgreSQL integration tests and
302 desktop/mobile browser tests.
Type checking, build and generated Assistant contracts are checked. This replaces
no fresh real-model or customer-cloud acceptance; no customer Plan
or Apply was started.

The final release also passed 718 unit, 53 database and
302 browser tests in CI and native Runner/image/archive qualification.
Runner staging with image/engine checks, migrations, API/web deployment,
service connections, separate Runner organization and broker isolation, and
public routes are successful. After deployment, actually served
JavaScript/CSS files match the approved revision byte-for-byte.
Eight public auth/PKCE/callback/CSRF checks passed. Real anonymous
desktop/mobile browsers each show ten name/type components, working
keyboard/mouse expand/collapse and overlap-free previews with all
projects open, without browser errors or server mutations.
A real user login, organization proof and customer Plan were not
performed automatically.

For that release, the separate
[Validate Configurator run 38782981811](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38782981811)
remained red on Standalone contract and STACKIT/GitHub operator-guard assertions.
This historical run is not counted as passing. The dev acceptance of
2026-10-16 documented below includes corrections and a fully green
new validation run.

Real-model acceptance of the original request for Corporate/Public templates
with local networks passed in three independent synthetic runs:
two named templates, saved region, local networks, no Sandbox,
no extra services and no follow-up questions. Corporate uses the
existing `default` network area, even without an explicit key override.
Source verification for product plans, addresses and IDs remains unchanged.
Model acceptance is synthetic and changes no customer configuration.
With user approval, corrections were committed and pushed as `a031273` and
published through successful [dev release 38710301311](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38710301311).
Public hosted checks and comparison of the served
UI bundle with this release passed; acceptance executes no
customer cloud resources.

Selection fields exist for regions, regional network identifiers, existing
network areas, namespace project identifiers and the Accelerator-defined
audit-scope, VPN-routing, secret-enforcement and firewall values.
Imported values that no longer match remain visible and are not automatically
replaced. Free-form labels remain text fields. Regional product offerings such as
machine types, plans and versions need API-based catalogues in future;
no supposedly complete static lists are presented.

<a id="template-übersicht"></a>
### Template overview

Application templates appear as selectable overview cards with name,
stable identifier, kind, region, target folder and network assignment. Only the selected
template shows its complete edit form. New templates are
selected immediately; after removing a template, an existing template remains
editable. The structure view groups the same templates by kind and
target folder and opens the same detail area on selection.

The network view shows Corporate templates only under the referenced
network area of their region; a missing key override still means
`default`. Public templates are not shown as central network spokes.
Missing SNA or folder references remain explicit. Templates
remain drafts for later orders, not already created projects.
Selection and editing save or deploy nothing automatically.

With user approval, the overview was published as source `9c19327` through successful
[dev release 38720037784](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38720037784).
All 296 desktop/mobile browser tests passed, including
selection, shared structure preview, adding, removing and empty state.
Served JavaScript and CSS bundles were compared with the exact built
source. Existing customer configurations were not changed.

<a id="komponenten-in-der-strukturvorschau"></a>
### Components in the structure preview

The structure preview also shows configured components under platform projects,
each with name and type only: automation service account,
Secrets Manager, Object Storage buckets,
Observability, Audit Logs and Telemetry Router, assigned SNA, networks,
DNS zones, firewalls including a configured HA partner, VPN gateways,
Git service, Kubernetes clusters and their optional services.
Network components are assigned to the correct hub by region and network area.
SNAs appear as logically assigned network areas, not as
a statement about their actual Resource Manager container.
Disabled services and merely referenced existing DNS zones do not appear
as components to be newly provisioned. The audit archive remains visible,
as in the Accelerator, even without enabled audit logging.
The preview uses native defaults only for display; it
does not materialize them in the draft or read existing cloud resources.
Projects with components are initially collapsed and can be opened and closed through the arrow,
the entire heading row or the keyboard.
Structure and network previews remain one below the other in normal
document flow in the editor, even with all projects open; no second sticky area
covers templates below.

<a id="erstbereitstellungspläne"></a>
### Initial deployment Plans

The blanket block for `audit_logs`, `observability`, `connectivity` and `devops`
has been replaced by tested support. For Connectivity, this covers
network areas, DNS, firewall/HA infrastructure and VPN gateways.
The firewall image is the version- and SHA-256-bound OPNsense file
already used in the Accelerator; the Runner checks actual image files
and their packaging. An old Runner without a matching image remains explicitly
blocked rather than creating a supposedly executable Plan with `/dev/null`.

This is Plan approval, not automatic provisioning: firewall policies,
bootstrap, appliance Apply and VPN connections with pre-shared keys
still need their separate execution or secret-binding support.
Audit targets outside the verified organization context remain blocked.
Identity/owner proofs, tenant separation, snapshot checks and explicit
approvals remain required unchanged. Specific limitations are described in the
[Runner contract](../runner/README.md).

Preparations are immutable evidence including Accelerator revision.
Saved configurations are separate and remain editable after a
Configurator release and usable as sources for new preparations.
A Configurator-only version change requires no new preparation
as long as its Accelerator contract still matches the installed Runner.
The fixed defect also affected freshly created preparations: the interface
still used the base revision while the Runner already expected the
platform-contract root. No recreation of the configuration
or new state is needed for this.
For a Runner with the platform-contract root, the interface displays preparation
for its current revision requiring explicit confirmation. Without confirmation,
creation remains blocked. If an older preparation's revision
does not match the Runner, the Plan error now names this reason and requests a new
preparation instead of merely reporting invalid configuration. Existing
preparations, state bindings and Plan evidence are not rewritten;
Plan and Apply retain their own approvals.

Selecting the current Accelerator revision is also allowed for an initial deployment;
it does not require an already provisioned platform. Without
a state binding or with an empty default state (version 0), a new
preparation can be created. This also applies after a failed first Plan.
Existing bindings remain. Locked state still explicitly prevents
switching; already saved default state must
be adopted into its S3 backend before switching. A selected
S3 backend without readable state still permits no bootstrap.

Preparation errors distinguish state locks, backend conflicts, invalid
requests and expired security confirmations. Unknown
server errors show HTTP status and error code instead of an endless
request to refresh the list.

The DNS zone type denotes the role `primary` or `secondary`, not
visibility `public` or `private`. Common configuration validation
reports invalid types at the specific zone field, including regional
Connectivity configurations. The generic Assistant contract allows the same
DNS roles in the model output schema and server-side acceptance check.
This also applies to complete network objects and direct field proposals,
as additions or replacements and in both network models.
Old drafts remain loadable and
exportable unchanged; they are not silently reinterpreted. For a self-managed
new zone, the user can explicitly correct the type to `primary`.
Then save and create a new preparation for this
revision; old preparations keep their original snapshot.
This supplementary DNS validation is not yet part of the following dev acceptance.

During platform Plan and Apply, the Runner sends a sanitized output snapshot
every two seconds while an OpenTofu phase runs. The API stores
it encrypted and delivers it to the
output view during execution. Transfers occur sequentially; pending transfers
are awaited before result acknowledgment
and cleanup. Incomplete final lines are transferred only after completion
so partially written credentials cannot bypass sanitization.
After final status, further log changes are
blocked. “Follow output” still controls
automatic scrolling, not transmission. The separate
Application Runner retains its previous one-off completion report.
This live-output correction is also not yet published.

The related local regression includes fresh and previously failed
initial Plans with default and S3 backends through successful Plan evidence,
without Apply. It checks unchanged configurations, old preparations,
state bindings and still-blocked states. Desktop and mobile tests
also cover explicit selection of the current Accelerator revision
without an existing S3 backend, and specific and unknown error messages.
**Dev acceptance of 2026-10-16:** the improvement was published as immutable source
`6a5014e7821586a60699bcd52d148f0d56718b8b` through successful
[dev release 38867967256](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38867967256).
The related
[Validate Configurator run 38867967250](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38867967250)
is also fully successful. Normal protected dev approval followed only
after successful separate validation and release build.
Both workflows passed 718 unit tests (63 skipped in normal unit execution),
57 explicitly enabled PostgreSQL Plan/broker tests, 53 API database tests,
304 desktop/mobile tests and 13 native template-contract checks. Separate
validation also passed all six infrastructure roots including
formatting, validation and mock Plans. The release passed native
Runner/provider/image/archive qualification and actual
Cloud Foundry deployment including migrations, service connections,
separate Runner organization, rejected job ticket and public routes.

Served JavaScript/CSS files match the approved
build byte-for-byte. Eight public auth/PKCE/callback/CSRF checks passed.
Real anonymous desktop/mobile browsers each show ten name/type components,
working expand/collapse and overlap-free previews without
browser errors or server mutations. Login was not completed with a
real user; organization proof or customer Plan/Apply
was not executed. Saved customer configurations were not changed.

The separate validation workflow checks the real release configuration in the
application job after the API build. The infrastructure job still needs
no application dependencies. The earlier STACKIT error came from
the missing compiled validator there, not a GitHub requirement.
The native Standalone test expects a successful contract for the example
now explicitly marked Public. Separate negative tests
still check that missing or explicitly true `corporate` without central
Connectivity is rejected; the native default remains unchanged.
Validation and release both run `npm run test:common-contract` and
`npm run test:platform-database`. The second command explicitly enables the isolated
PostgreSQL broker suite skipped in normal unit execution.
Future releases thereby also test initial deployment and
native template contracts, not only already existing platform state.
API database integration uses the same two
workers and 30-second test timeout in both workflows. The former 5-second limit in
the validation workflow interrupted multistage contract/identity proof
before its cleanup and restoration steps completed.

Joint release acceptance passed 710 unit tests (57 skipped in unit execution),
51 PostgreSQL broker tests and 300 desktop/mobile browser tests,
type checking, build and 19 targeted release/staging/Runner-evidence tests.
Native contract, offline provider and real image/archive checks
additionally qualified Runner support.
There were no customer cloud Plans, Applies or Destroys.

Component preview, Plan support and unambiguous STACKIT confirmation
were published with user approval as source `0cee76f` through successful
[dev release 38769119929](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38769119929).
On CF, image SHA checking, native Runner checks,
migrations, service connections, Runner isolation and canonical route checks passed.
Served JS/CSS files match the built source byte-for-byte.
Eight additional live auth/PKCE checks and two real anonymous
desktop/mobile browser runs passed; the preview showed only name
and type, without browser errors, horizontal overflow or server mutations.

The large image is omitted only from the hosted upload and moved after SHA checking
into the immutable droplet during staging without a second file copy. This is the
durable CF cache; a redundant large buildpack cache archive is unnecessary.
There is no download per user or Plan. Web/API use 6 GiB disk
for the larger inspection copy and staging compression; the qualified
4-GiB budget of isolated Runner jobs and tasks remains unchanged.
Package identity and byte-identical restoration of both archives are checked.
Details:
[CF staging and cache](../deploy/cloud-foundry/README.md#image-staging-and-caching).
A personal STACKIT login, live owner proof and customer cloud Plan were
neither executed nor pretended by this.

The separate
[Validate Configurator run 38769119849](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38769119849)
remains red on already known Standalone template-contract and
STACKIT/GitHub operator-guard assertions. Successful release run
and live acceptance are separate; not all repository CI is green.

<a id="kompatibilität-und-grenzen"></a>
## Compatibility and limitations

- Existing v1/v2 documents remain usable in the previous editor. **Switch to common
  editor** is an explicit migration; existing engine values
  are preserved when switching. Existing deployment preparations remain unchanged.
- The previous Standalone editor can still be selected on the Standalone preview page,
  including the previous personal Plan flow.
- v3 is supported in forks and browser working state. Template hashes,
  tenant/account isolation, write base, conflict checks and atomic export are preserved.
- v3 deployment preparations are **blocked server-side**. Runner integration and
  protected additional credential bindings undergo separate acceptance.
- No secret fields in configuration forms. VPN keys, firewall
  passwords/API secrets and kubeconfigs must not be pasted into free-text fields.
- The ineffective folder description is not offered as an editable feature.
- Form and type coverage are not provider validation. Plan/refresh,
  service availability, permissions and every module combination need further
  execution acceptance. Limitations #37/#65/#80 remain visible.
- No customer Apply without explicit new approval, no Destroy.

<a id="prüfung"></a>
## Verification

- [x] Domain labels for all nonsensitive schema fields checked.
- [x] Project kinds, references and area normalization as domain tests.
- [x] v3 JSON/tfvars saved atomically; deployment guard tested in the backend.
- [x] New editor, kind switching, navigation and area references tested in browser.
- [x] v3 fork saving, export, resumption and blocked preparation tested.
- [x] Legacy editor, GitHub login, fork conflicts, credentials and Plan flow regression-tested.
- [x] Release on lzc-dev and live connection tests accepted.

Manual check after publication: open Hub & Spoke and Multi-Region,
switch project kind/area, save draft to own fork, reopen and
reload browser. Check additional optional services under Platform/Operations.

<a id="live-abnahme"></a>
## Live acceptance

Code `527bd9582f95d3cf845cfaf242f9022e1495fad8` published:

- [Validate Configurator 36745965890](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965890): successful.
- [Configurator Release 36745965953](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965953): successful.
- 95 application tests and 20 desktop/mobile browser checks, including v3 storage and legacy compatibility.
- Native HCL/OpenTofu contract tests and infrastructure checks successful.
- CF network, PostgreSQL/Secrets Manager connections, isolated Runner and public routes checked successfully.
- Direct live browser check: open Multi-Region template, start new editor, check project list/network view on desktop and mobile; no page errors or horizontal overflow.
- Public JavaScript/CSS files compared by SHA-256 with the tested build; `/healthz` returns `ok`, session without login `401`.

[Live application](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud).
No customer configuration applied and no change merged to `main`.


<a id="live-nachbesserung-plattformdienste-und-voreinstellungen"></a>
### Live improvement: platform services and defaults

Code `10a6ec87f0d0fc9d32d4b9699bd8579fb651683c` published:

- [Validate Configurator 36752620342](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620342): successful.
- [Configurator Release 36752620332](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620332): successful.
- 96 application tests, 22 desktop/mobile browser cases and 11 native OpenTofu variable tests successful.
- Live build matches locally checked bundle; health check `ok`, anonymous session `401`, no browser errors.
- Live checked: new Standalone configuration is Public; region is a selection; platform services and Kubernetes deactivation available. Desktop/mobile view without horizontal overflow, mobile platform view visually checked.
- Connection tests to PostgreSQL/Secrets Manager and Runner separation successful.

Manual: reload app, open a **new** Standalone draft, set organization ID
and own owner email addresses, check Public under Projects
and save/export. In an existing affected draft, explicitly select Public
once. Configure/disable Kubernetes under Platform;
select regional identifiers and area references under Network.

<a id="nächster-bedienstand-komponenten-statt-vollständiger-feldliste"></a>
## Next interaction state: components instead of a full field list

The [binding design principles](editor-design-principles.md) guide further
development. Initial implementation covers platform and Kubernetes namespace services:
inactive components are accessible through **Add component**; active
components remain visible. Opening and closing the catalogue does not change
export. An empty cluster list is inactive; a non-null
Observability configuration block, by contrast, enables the service even with defaults.

Public/Corporate project cards contain direct toggles for Secrets Manager and
Observability. Sandboxes do not have these root options. Network labels
explicitly name Connectivity and SNA; a notice explains automatically
created routing tables. A unified region/SNA editor and guided
VPN flow remain open and are listed separately in the design plan.

This section describes working state; live acceptances recorded above
refer to their explicitly named commits.


<a id="regions-sna-ansicht-und-vpn-assistent-arbeitsstand-2026-10-01"></a>
## Region/SNA view and VPN assistant (working state 2026-10-01)

Network shows Connectivity as region cards with SNAs and optional DNS,
firewall and VPN components. Existing `connectivity` remains in its previous
engine format; new empty configurations can add explicit regions.
Existing default-region configurations are not automatically migrated
to regional modules. Export remains unchanged on opening.

The [VPN assistant](vpn-configuration-scope.md) maps the Accelerator contract
and checks basic required inputs. Protected keys, live catalogues and
deployment execution remain missing. The new [self-service architecture](platform-application-architecture.md)
is planned; this has not yet changed roles or permissions.


<a id="live-abnahme-2026-10-01-regionen-snas-und-vpn"></a>
## Live acceptance 2026-10-01: regions, SNAs and VPN

Code `78d8f7c6debeba29330fa2699d617da17c3ba3be` published on lzc-dev.

- [Release 36830339767](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339767): successful, including PostgreSQL/Secrets Manager connection tests and Runner check.
- [Validate 36830339847](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339847): successful.
- Release includes 97 application tests and 24 desktop/mobile browser cases.
- Live bundle `/assets/index-BjLAVHUk.js` matches the checked editor release.
- Direct guest browser check: existing templates/project view, add components, add region eu01, open STACKIT VPN, configure connection with two tunnel fields.
- Health `ok`, anonymous session `401`, no browser errors or horizontal overflow on mobile. No customer resources created.

Manual acceptance: open an existing configuration and save unchanged; configure new
Connectivity region/SNA; add optional VPN and check its scope,
required inputs and tunnel settings. VPN execution remains blocked.

The subsequently created separate Application root and its compiler are
a prototype testable locally or on the feature branch, not part of
the activated self-service interface.


## Observability plan capabilities

The editor retains the selected plan and all explicit retention values. Fresh
Observability catalogue entries carry only validated metric/log/trace capacity
flags, not raw API responses. A zero capacity forbids its retention override;
missing capacity is unknown. Data older than 15 minutes or from the future is
not treated as live. Missing fields fall back to the reviewed service-family
policy. Live data can further restrict the pinned native contract, but cannot
expand settings that the reviewed native engine explicitly rejects.

Monitoring supports metrics retention, not logs or traces. Frontend and Metrics
Endpoint have no configurable retention. Unknown support is shown for review;
preparation rejects unverified explicit options. All central retention fields
accept omission/null for service defaults. Whole-day bounds use the documented
service limits: logs/traces 1–30, metrics/downsampling 1–780. This is not a quota
or target-project availability guarantee.

Known unsupported optional fields cannot be activated. Existing incompatible
values stay visible and can be deliberately reset; selecting another plan never
drops them. Live-aware validation preserves unrelated validation, including ACLs.
The server rechecks capabilities before preparation and Assistant proposal
acceptance. The Assistant receives the same safe capability flags and reviewed
fallback facts. Neither catalogue access nor proposal acceptance authorizes Apply.
