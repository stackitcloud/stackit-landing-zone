<a id="gemeinsames-funktionsmodell-des-landing-zone-configurators"></a>
# Common feature model of the Landing Zone Configurator

[English](common-feature-model.md) | [Deutsch](common-feature-model.de.md)

As of 2026-09-30. Architecture decision after user feedback on project/folder selection.
**Templates are presets of the same Accelerator. They do not define the editor's feature scope.**

Current concept status 2026-10-10: the historical inventory below lists
28 inputs. Today's domain catalogue contains 29, including
`platform_contract_namespace`. Current field-level AI coverage is in the
[Assistant matrix](assistant-feature-coverage.md). Its source hashes and tests
check the current local catalogue; they confirm no new engine or
cloud approval under the historical pins of this inventory.

This decision replaces extending the Standalone editor with an isolated
Corporate/single-area special case. The common editor has now been published on lzc-dev. Public/Corporate
assignment and network areas are edited on this model; v3
deployment integration remains a separate, not-yet-approved step.

<a id="verbindliche-quelle-und-vollständigkeit"></a>
## Authoritative source and completeness

1. Approved Accelerator commit: `a256f6896d11134fdc351786f1be5eba4e56b2e2`.
   The current local `src` revision matches it.
2. `src/variables.tf`: 28 root inputs including nested types,
   optional values, actual defaults, sensitive inputs and validations.
3. All root files: especially `main.tf`, `providers.tf`,
   `_landing-zone-kubernetes.tf` and `_firewall-bootstrap.tf`. These determine
   which features can be combined and when they are executable.
4. Module implementations: actual resources, naming, parent relationships,
   roles, prerequisites and side effects. A child-module parameter
   not passed through by the root call is not yet an available UI option.
5. All eight configs are reference cases; commented examples do not count as
   enabled or tested features.

The generated [input inventory](accelerator-inputs.json) contains all 28 inputs
with type tree, optional defaults, source line and validation blocks. Sensitive
default values are omitted. It is a technical completeness foundation,
not an automatically rendered Terraform variable form. Domain labels,
dependencies, availability and UI components come from the common model.

Update and check:

```sh
cd landing-zone-configurator/tools/hcl-adapter
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json -check
```

The validation pipeline checks freshness. An Accelerator update
also requires domain review of module wiring, allowed combinations and compiler rules;
a current JSON inventory alone is insufficient.

<a id="referenzkonfigurationen"></a>
## Reference configurations

| Reference | Coverage |
| --- | --- |
| Standalone | Minimal entry, Public projects and sandboxes |
| Hub & Spoke | One network area, Corporate and Public, sandboxes |
| Hub & Spoke Firewall | Appliance in a single area |
| Multi-Area | Multiple areas and explicit project assignment |
| Multi-Region | eu01/eu02, regional areas and platform Kubernetes |
| Prod/Nonprod Firewall | Multiple areas with assigned firewalls |
| Finance & Research | Different DNS/network requirements per area |
| Tenant Isolation | Three separate areas and assigned projects |

**Multi-Region and Prod/Nonprod Firewall together form the structural reference.**
Additional tests cover features no template actively uses, such as VPN,
audit logs, federated identities, firewall HA and namespace services. An artificial
“everything enabled” template would not be sufficient: some combinations
are not currently implemented in the Accelerator.

<a id="vollständige-fachliche-funktionsbereiche"></a>
## Complete domain feature areas

| Area | Subfeatures | Root inputs |
| --- | --- | --- |
| Foundations | Organization, owners, display name, code, default region, labels | `organization_id`, `owner_email`, `company_name`, `company_code`, `region`, `labels` |
| Organization and folders | Shared existing parent, folder roles and display names, additional folders, owner/auditor assignments | `rm_folder_parent_id`, `rm_folders`, `organization_owners`, `organization_auditors` |
| Management | Mandatory management project, state bucket, optional central Observability, audit routing/archiving, retention/Object Lock, federated identities | `observability`, `audit_logs`, `federated_identity_providers`; base resources automatic |
| Connectivity | Regions, 0..n network areas per region, address pools, transfer networks, prefix sizes, resolvers, DNS zones and assignment | `connectivity`, `connectivity_regions` |
| Firewall infrastructure | Appliance per supported area, size/zone/networks/IPs, optional HA/CARP | Subfields of `connectivity`/`connectivity_regions` according to root wiring |
| VPN | Gateway, plan/routing type, connections, two tunnels, peers, routes/subnets, IKE/IPsec settings | `connectivity.vpn`, `vpn_pre_shared_keys`; check regional support separately |
| Firewall policy | Aliases, routes, rules, outbound NAT, port forwarding, endpoint/TLS | `firewall_config` |
| Firewall credentials and execution phase | User, password/API access, initialization, secret version | `firewall_admin_username`, `firewall_admin_password`, `firewall_api_credentials`, `firewall_bootstrap`, `firewall_api_secret_version` |
| DevOps | Git service, allowed networks and automatically derived platform project | `devops` |
| Platform Kubernetes | Regional clusters, node pools, network/area reference, DNS/gateway, Observability, encrypted volumes/KMS, bastion/SSH, roles | `platform_kubernetes` |
| Kubernetes access | Protected cluster access for supported follow-up steps | `platform_kubernetes_kube_config_override` |
| Landing Zone projects | Public/Corporate, region and network area, stable identifier, code, environment, owners, network size, roles/custom roles, Secrets Manager and Observability | `landing_zones` |
| Sandbox projects | Name, owners and additional owners | `sandboxes` |
| Namespace services | Namespace/DNS, Kubernetes access, secrets integration and policy modes, break-glass, labels/annotations, optional demo/load/metrics | `landing_zone_namespace_services` |

This table maps every root input. Subfields are included in the inventory;
UI coverage will be tracked **per subfeature/field**, not only per
top-level toggle. Demo and diagnostic features appear separately from
ordinary production features.

<a id="gemeinsames-dokument-und-compiler"></a>
## Common document and compiler

A versioned, template-independent document describes the domain objects:

- Provenance: original template and source hash, approved Accelerator revision.
- Organization, folder roles and permissions.
- Regions and network areas with stable IDs; references instead of positions.
- Platform services and their area/region assignment.
- One common project list with explicit kind, stable identity,
  region, optional network area and project-specific services.
- Security/operations features and namespace offerings with explicit references.

Passwords, VPN keys, API secrets and kubeconfigs do **not** belong in the
Git document, browser working state or chat history. Document content
names required credentials; personal assignment and secret references reside
server-side in deployment profiles and Secrets Manager.

The common processing flow is:

```text
Template / gespeicherte Config / Chat-Änderung
                  ↓
        Import + Versionsmigration
                  ↓
    gemeinsames fachliches Dokument
          ↙             ↘
    Formular-UI       Struktur-/Netzansicht
                  ↓
      gemeinsame fachliche Validierung
                  ↓
    versionierter deterministischer Compiler
                  ↓
       natives tfvars + Deployment-Anforderungen
```

Form, chatbot, graphic and export use the same model. There are no
separate feature lists per template. Switching template is an explicitly
confirmed new preset; it must not silently replace existing user changes.
For existing configurations, provenance is not a feature limit.

<a id="verbindlicher-accelerator-vertrag-2026-10-10"></a>
### Binding Accelerator contract (2026-10-10)

Supplementary knowledge architecture: curated Markdown modules per topic/service
with a fixed section contract, explicit manifest, source/content hashes and
generated backend bundle. The initial SNA/credential modules have been
expanded to 19 topics covering all Accelerator areas and the configuration lifecycle.
Each of the current 29 root inputs needs an explicit topic
assignment; the freshness/completeness gate checks it. Topic selection follows
feature groups plus knowledge dependencies, not compulsory activation; credential
basics and lifecycle are mandatory. Template values are not user approval
to provision optional components. No arbitrary Markdown/web/customer-data ingestion,
no vector database or automatic knowledge promotion. The required
freshness check blocks stale artifacts. Markdown explains; schema/compiler
decide. Architecture and extension flow:
[Service knowledge](assistant-knowledge/README.md).

The Assistant translates free-form requirements exclusively into this common
configuration model and its already supported Accelerator inputs.
It generates neither unrestricted Terraform nor editor-/chat-exclusive resources or
provider configuration. Native export remains a configuration independently
usable with the matching Accelerator version. Currently this is
Terraform tfvars, not a newly invented YAML schema. A later YAML format
needs an explicit versioned import/compiler contract to the same
Accelerator; it must not require a second domain logic or Configurator runtime.

Feature introduction is end-to-end: concept/architecture, Accelerator/module
contract, input schema, common domain model, validation, import/export,
editor/Assistant, documentation and tests. Missing features are
identified as missing and introduced where the domain decision belongs, not
as a UI special option or freely generated Terraform block.

Credentials are not model/patch values. Configuration and secure credential
bindings are separate: export must make required external credentials
and references understandable; outside the Configurator these are
provided through documented Accelerator/provider inputs or environment variables.
No Configurator-exclusive hidden secrets, no
plaintext secrets in exported configuration and no credential questions
in chat. Exportability alone is no proof of execution or permission.

The first structured chat patch extends only existing SNA inputs
(network_area/network_areas). It introduces no new Accelerator feature.
Firewall, VPN, regional connectivity and other complex components each need
their own reviewed proposal/binding contract.

Import/export distinguish **unset**, **explicit null/disabled** and
**explicitly configured**. Displaying effective defaults must not write
every option into the export merely on opening. Unedited values are preserved.
Deliberate normalization of the two supported Connectivity
input forms is also necessary; they must not both be exported as active sources.

Versions 1/2 of already saved Standalone documents receive a reviewed
migration adapter. No silent changes to keys, resource addresses,
folder assignment or old tfvars hashes. Old deployment preparations remain
immutable; changes create new revisions and preparations. The
unpublished single-area prototype version 3 is not established as a format.

<a id="projektarten-und-grafische-darstellung"></a>
## Project kinds and graphical representation

A common project list replaces implicit separation into upper Landing Zone
and lower sandbox forms. Creation and editing display:

| Project kind | Target folder role | Further selection |
| --- | --- | --- |
| Public | `landing_zones_public` | Region, project services; no automatic public exposure |
| Corporate | `landing_zones_corporate` | Region **and existing network area of that region** |
| Sandbox | `sandboxes` | Sandbox-specific inputs |
| Platform project | `platform` | Created by Management/Connectivity/DevOps/Kubernetes; not an arbitrary fourth project kind |

The UI shows the actually configured folder name. Network areas
are managed in the editor's networking section and explicitly referenced;
a Corporate project creates no hidden second network-configuration path.
Removing an area with references is blocked. Project-kind switches show
effects on data, assignment and resource identities and need
deliberate confirmation; this does not yet apply existing resources.

The graphic uses two connected views:

1. **Organization:** organization → optional parent → folders → projects and
   relevant offerings, including automatically created platform projects.
2. **Network:** region → network areas → assigned Corporate projects,
   firewall/VPN/DNS. Public and sandbox remain correspondingly unbound.

A network area is not a Resource Manager folder. Multiple areas in one
region can create multiple hub projects; the previous blanket display
“one hub per region” must be replaced accordingly.

<a id="editor-struktur-und-abhängigkeiten"></a>
## Editor structure and dependencies

Domain areas: **Foundations → Organization/folders → Network → Platform → Projects
→ Security/operations → Review**. A feature overview shows enabled offerings
and possible additions. Optional details appear when needed, but remain
accessible for every template. Terraform variable names are not used as the primary
interaction interface.

Each feature definition receives a stable ID, domain explanation, configuration schema,
default/activation rules, references/dependencies, responsible editor,
graphical projection, compiler mapping and tests. Separate states:

- present in the Accelerator revision;
- permitted in the current combination;
- implemented in the editor;
- supported for Plan/Apply in the current execution phase.

This avoids falsely offering an existing engine feature as an already executable
Configurator feature. Full UI coverage remains the goal; migration
is not presented as “all features complete”.

<a id="bereits-festgestellte-kombinationsgrenzen"></a>
## Already identified combination limitations

The [limitations and issue register](accelerator-limitations.md) maps findings
to Accelerator issues and separates modelability from executability.

- Private/SNA Kubernetes APIs are not demonstrably reachable from the current CF Runner
  ([#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37)).
  Kubernetes/Helm phases may run only with a suitable network path.
  Server-side capability checking is a prerequisite for model extension;
  private Runner connectivity is implemented separately.

- Corporate references an existing area; with regional connectivity,
  the project region must exist in the regional model (`variables.tf`).
- Regional root instances currently support eu01/eu02. Arbitrary additional regions
  first need Accelerator support.
- For `connectivity.firewalls`, keys must match `network_areas`.
- `firewall_config` is currently bound to the single `connectivity.firewall`.
  The policy UI must not infer arbitrary multi-area/multi-region support.
- Namespace services need exactly one matching instance of nonregional
  `module.platform_kubernetes`; root files also use `module.landing_zone`.
  The Multi-Region Kubernetes template therefore does not prove regional namespace support.
- Firewall bootstrap and later Kubernetes/VPN steps may need multiple
  execution phases and protected runtime information. These phases
  are controlled by the deployment model, not a normal feature toggle.
- Comments are not reliable defaults: for audit logs, the text describes
  Object Lock as off while the actual optional default is `true`.
  The UI must explicitly show the effective setting. Likewise,
  folder description is accepted in the root type but not passed through to the resource.
- Some module options, such as governance custom roles or certain ACLs, are not passed
  through by the root call. Accelerator changes would be a separate scope.

<a id="umsetzung-und-abnahme"></a>
## Implementation and acceptance

<a id="a--vollständige-grundlage"></a>
### A – Complete foundation

- [x] Inventory all eight templates and 28 root inputs.
- [x] Automatically extract nested types, defaults and validations.
- [x] Exclude sensitive defaults from the inventory and test this.
- [x] Check inventory freshness in CI.
- [x] Define feature areas, project model and key combination limitations.
- [x] Map field/subfeature coverage as a machine-verifiable feature catalogue
  (`featureFieldCatalogue`; form fields, protected bindings and ineffective fields separately).

<a id="b--gemeinsames-modell-und-kompatibler-compiler"></a>
### B – Common model and compatible compiler

- [x] Implement versioned document independent of Standalone (v3 domain contract).
- [x] Losslessly import all eight templates, preserving provenance and stable IDs.
- [x] Legacy adapter for saved document versions 1/2, byte-identical export.
- [x] Migrate local working states and switch storage/product API.
- [ ] Centrally validate reference/default/deactivation rules.
- [x] Semantically compare export with a real HCL parser; additionally check unchanged
  legacy configurations byte-for-byte.
- [ ] Native OpenTofu tests with mock providers per reference configuration, no Apply.

<a id="c--erster-vollständiger-bedienablauf-auf-dem-gemeinsamen-modell"></a>
### C – First complete user flow on the common model

- [x] Edit folders, regions and multiple network areas.
- [x] Common project list with Public/Corporate/Sandbox and visible target folders.
- [x] Region/area selection for Corporate; derive platform projects from modules.
- [x] Generate organization and network views from the same data.
- [x] Check fork saving, resumption, navigation and existing preparations.

<a id="d--vollständige-feature-abdeckung"></a>
### D – Complete feature coverage

- [ ] Management/governance, DevOps and Observability/audit/federation.
- [ ] DNS, firewall per supported area, HA, VPN and supported policy features.
- [ ] Kubernetes/node pools, KMS/volumes, bastion, namespace services and access.
- [ ] Qualify secret bindings and execution phases per feature.
- [ ] Build chat tools on the same catalogue and validation.
- [ ] Coverage matrix: no supported subfield without UI, import/export and tests.

<a id="release-grenzen"></a>
### Release boundaries

Feature branch only. The previous revision remains live until each increment is
fully tested. No customer Apply without new explicit approval; no
Destroy. A complex template must not automatically start a customer Plan or
resource provisioning. Configurator infrastructure approval remains separate.

<a id="implementierungsstand-gemeinsamer-kern-2026-09-30"></a>
## Common core implementation status, 2026-09-30

[Domain contract and checks](../app/packages/domain/README.md) are implemented.
Types and explicit values of all root inputs are covered; sensitive inputs
are intended exclusively as separate deployment bindings. Reference checks
for projects/areas/DNS and known execution limitations exist as shared
functions. This is not yet complete domain-specific provider validation.

All eight templates are compared with the native HCL parser. Ten direct
OpenTofu tests check the root variable contract including Object Lock defaults.
Complete module plans with mock providers remain open. Standalone contains the
confirmed defect [#84](https://github.com/stackitcloud/stackit-landing-zone/issues/84);
unchanged import reports the missing Public marking. Existing
v1/v2 creation and already saved drafts remain byte-identical.

The new core is not yet connected to the production editor, fork storage or Runner.
It therefore neither silently approves new configuration kinds for deployments
nor migrates existing preparations. The next increment is the
common network/project editor with controlled storage and API migration.

<a id="abnahme-des-gemeinsamen-kerns"></a>
### Common core acceptance

Code `e6106b9`, [Validate Configurator 36737858294](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36737858294),
attempt 2 successful: application (89 unit tests), database integration, browser tests,
HCL round trips, ten native variable contract tests and all six infrastructure checks.
The first attempt failed solely during OpenTofu download in an
infrastructure job with HTTP 500 from GitHub; repeat successful.

No release of this internal core, no customer Plans or Applies executed.
The published interface remains unchanged until the tested editor increment.

<a id="nachgezogenes-editor-inkrement"></a>
## Subsequent editor increment

[Common editor](common-editor.md): seven areas, domain-labeled
forms for all nonsensitive root inputs, common project selection,
area assignment, v3 fork storage and browser resumption. Existing
v1/v2 configurations remain compatible; switching to the new editor is explicit.

Form coverage does not yet mean complete deployment acceptance of every
submodule. Protected additional bindings and v3 Runner integration remain open;
the backend guard prevents corresponding deployment preparations.

<a id="abnahme-des-editor-releases"></a>
### Editor release acceptance

Code `527bd95` is published on lzc-dev. Release and full validation
successful; 95 application tests and 20 browser checks passed. Live assets and
CF connection tests checked. [Evidence and checklist](common-editor.md#live-abnahme).
