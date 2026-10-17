<a id="verbindliche-designprinzipien-des-landing-zone-configurators"></a>
# Binding design principles for the Landing Zone Configurator

[English](editor-design-principles.md) | [Deutsch](editor-design-principles.de.md)

Status: direction confirmed by the user; incremental implementation on the feature branch.
These principles supplement the [design reference](design-reference.md) and
[common feature model](common-feature-model.md).

<a id="begriffe-und-orientierung"></a>
## Terminology and orientation

- Use official STACKIT product names: STACKIT Network Area (SNA), STACKIT VPN,
  STACKIT Observability, STACKIT Secrets Manager. Where no product is meant,
  use the Accelerator module name, for example Connectivity.
- Explicitly identify Kubernetes namespace services as a Kubernetes feature.
- Distinguish product, module, resource and instance. Observability and the
  Telemetry Router for audit logging are different services.
- Technical field names serve internal mapping; visible terms, help and
  flows follow the product and its official documentation.
- Claim portal parity only after actual comparison. The public VPN
  guide still calls portal integration unavailable; this is not
  evidence about the current portal flow observed by the user.

<a id="arbeitsbereich-und-konfigurationskontext"></a>
## Workspace and configuration context

Confirmed main flow: **Login > Open workspace > Open
or create configuration > Edit > Plan > Apply**.

- On first entry, offer available workspaces including the personal
  workspace; create and open are separate actions.
- On return, reopen the last still-accessible workspace.
  Do not override explicit deep links or secured login drafts.
- Keep workspace switching in the header accessible on mobile too.
- **Configurations** is the platform overview; **New configuration** opens
  templates. Templates and “My draft” are not primary sidebar destinations.
- Open configurations share **Configuration · Deployment · History**
  as a common context with name and saved revision.
- **Save and continue to deployment** uses exactly the new server revision.
  Unsaved changes block the direct deployment tab; switching
  to other workspaces must not silently discard them.
- History remains read-only and configuration-specific. Visible
  executions and status remain subject to existing role,
  user and tenant boundaries.
- Navigation and resumption start no preparation, Plan or
  Apply. Existing Plan bindings and expiry times remain unchanged.
- Application Owners retain the separate Application Landing Zone flow.

Implemented locally on 2026-10-04: full check with 305 unit tests and complete
browser suite with 134 desktop/mobile cases passed. Workspace selection and
configuration/deployment context visually checked. Browser APIs simulated;
no customer Apply or live S3 acceptance through this implementation.

<a id="weniger-sichtbare-komplexität"></a>
## Less visible complexity

- The overview compactly shows active components; settings appear only while editing.
- Make optional inactive components accessible through **Add component**.
- Determine activity from effective values including engine defaults, not only
  from existing JSON fields. Keep project services that are active by default visible.
- Opening the catalogue, closing a card and collapsing a section change no configuration.
- Disabling, removing and resetting are different actions. Do not lose existing
  settings and references merely by hiding them; explicitly identify planned
  resource deletion during a later Apply.
- Details in **Advanced settings**; keep required inputs and errors visible.
- Incomplete drafts may be edited. Show configured, executable,
  deployed and technically connected as different states.
- Known choices as dropdowns; load dynamic product offerings from regional
  catalogues. No invented or supposedly complete SKU lists.
- Clearly distinguish Accelerator defaults from template values. Do not silently
  normalize existing documents or switch them to different Terraform module addresses.

<a id="netzwerkmodell"></a>
## Network model

Target view: **Region → SNAs → assigned projects**, with DNS, firewall and VPN in
the Connectivity context. An SNA is an organization resource with regional
configuration. The current Accelerator creates separate SNAs per regional
module entry; identical identifiers do not create cross-region connectivity.

`connectivity` in the default region and `connectivity_regions` are alternative
engine inputs, not two independent products. A unified interface
must preserve existing export and resource assignment. Before
switching, check name prefixes, module addresses and limitations (#65/#80).

Do not portray routing tables as missing: the Accelerator creates a WAN table per SNA
and firewall default routes for Corporate projects.
Freely definable additional tables are not provided in the reviewed root contract.
Static VPN routes are a separate setting; automatic
inter-region connections remain issue #64.

<a id="vpn-als-erste-geführte-produktkomponente"></a>
## VPN as the first guided product component

1. **Gateway:** region, SNA, name, performance plan and availability zones.
2. **Routing:** explain and select the supported routing method; make the effects of
   a later change visible before execution.
3. **Connections:** peer and matching networks or static routes per connection.
4. **Tunnel and access:** both tunnels, peer addresses, protected PSK references.
5. **Review:** STACKIT resources, still-missing data and tasks on the peer.

Documentation links directly at the relevant step:
- [Create gateway](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/gateway-create/)
- [Create connection](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/connection-create/)
- [Gateway and connection options](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/basics/gateway-and-connection-options/)

The Accelerator can create a gateway and configured STACKIT-side connections,
not configure the remote VPN device. BGP is not supported in the reviewed module.
Common editor, protected VPN key binding and
complete deployment execution are separate extensions. A complete
dialog alone must therefore not be portrayed as an operational VPN.

<a id="umsetzung-und-abnahme"></a>
## Implementation and acceptance

- [x] Document design principles with user decision.
- [x] Adjust Kubernetes/Connectivity/SNA terminology in the editor under development.
- [x] Make project toggles for Secrets Manager and Observability directly accessible.
- [x] Implement initial component overview for platform and Kubernetes namespace services.
- [x] Extend component overview to optional Connectivity services (DNS, firewall, VPN).
- [ ] Simplify further nested optional services.
- [x] Implement unified region/SNA view preserving engine input forms and reference protection.
- [ ] Compare VPN inputs against engine version, product documentation and current portal flow.
- [x] Implement VPN configuration assistant with gateway, routing, connections/tunnels, summary and documentation links.
- [ ] Add complete product-side validation (including regional catalogues/IPsec compatibility).
- [ ] Connect regional product catalogues and protected VPN key references.
- [ ] Qualify separate gateway/connection phases and execution boundaries in the backend.
- [ ] Check domain labels, keyboard operation and desktop/mobile views.
- [ ] Regression-test saving/resumption, inactive configurations and unchanged exports.
- [ ] Publish and perform live acceptance of the revised interaction concept.

Customer Apply still requires explicit approval. No main-merge approval.

<a id="lokaler-prüfstand-der-ersten-umsetzung"></a>
## Local verification status of the first implementation

- Lint, TypeScript and production build successful; 96 application tests passed.
- 22 desktop/mobile browser cases passed. After adding the check for
  unchanged values on catalogue opening/closing, the six affected
  editor browser cases ran successfully again.
- Checked: project toggles, component selection, unchanged saving,
  resumption, legacy flows and existing deployment blocks.
- No deployment of these changes yet; last live acceptance in the
  [common editor](common-editor.md).

<a id="weiterer-prüfstand-2026-10-01"></a>
### Further verification status 2026-10-01

Region/SNA view and VPN configuration assistant implemented; 97
application tests and 24 desktop/mobile browser cases successful, mobile VPN view
visually checked. No publication of this working state yet. The
[Platform/Application architecture](platform-application-architecture.md) will separate
role views, templates and instances. The current interface does not
yet present these as existing authorization capabilities.
