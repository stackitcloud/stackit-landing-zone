<a id="accelerator-grenzen-im-configurator"></a>
# Accelerator limitations in the Configurator

[English](accelerator-limitations.md) | [Deutsch](accelerator-limitations.de.md)

As of 2026-09-30. The source findings below were additionally checked against
Accelerator `main` at commit `2bb7c755692674ad619ffc46a0a17a781f019106`.
The new issues contain source permalinks and acceptance criteria.
This is source review, not evidence from a customer Apply.
The Configurator continues to use its separately approved engine version.

<a id="erfasste-grenzen"></a>
## Recorded limitations

| Issue | Limitation | Consequence for the Configurator |
| --- | --- | --- |
| [#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) | Private/SNA SKE API unreachable from the public Runner; two-stage Runner model open. | Kubernetes/Helm provider operations require proven private reachability. Credentials alone are insufficient. Separate implementation. |
| [#65](https://github.com/stackitcloud/stackit-landing-zone/issues/65) | Policy automation for multiple firewall appliances missing. | Multiple appliances in the infrastructure model do not automatically mean supported policies per appliance. |
| [#64](https://github.com/stackitcloud/stackit-landing-zone/issues/64) | Automatic inter-region VPN connections and routing missing. | Multiple regions must not suggest implicit connectivity. |
| [#22](https://github.com/stackitcloud/stackit-landing-zone/issues/22) | Folder deletion fails when projects are marked for deletion. | No Destroy option; customer Apply still requires separate approval. |
| [#69](https://github.com/stackitcloud/stackit-landing-zone/issues/69) | Projects without default owner assignment still open. | Do not offer unsupported ownerless project creation. |
| [#80](https://github.com/stackitcloud/stackit-landing-zone/issues/80) | Namespace services reference nonregional cluster/project modules. | Regional clusters require explicit matching provider/project assignment. Relevant independently of #37, even with a public API. |
| [#81](https://github.com/stackitcloud/stackit-landing-zone/issues/81) | Audit Object Lock: actual optional default is `true`, description says off. | Make effective value visible; no silent default change on import/export. |
| [#82](https://github.com/stackitcloud/stackit-landing-zone/issues/82) | `rm_folders.description` is accepted but not passed through to the resource. | Do not promise an effective description field while the connection is missing. |
| [#83](https://github.com/stackitcloud/stackit-landing-zone/issues/83) | Governance custom roles and Landing Zone Secrets Manager ACLs exist only at module level. | Offer as configurable features only after the root contract is clarified. Distinguish existing project-specific custom roles. |
| [#84](https://github.com/stackitcloud/stackit-landing-zone/issues/84) | Standalone omits `corporate = false` in the Public example; `true` actually takes effect without connectivity. | Lossless import shows the missing area reference. Legacy editor already exports explicit Public and remains unchanged. |

#80–#83 were newly created during this review. #37 and #65 are
reused; no additional duplicates were created.
Valid area references, consistent firewall keys and the currently
supported regions are validation rules, not automatically new defects.

<a id="private-kubernetes-api-ausführungsgrenze"></a>
## Private Kubernetes API: execution boundary

The current CF Runner has no proven network path into the customer SNA.
Authentication with the STACKIT API and successful organization access prove
neither routing nor DNS, TLS or Kubernetes permissions for the cluster API.
Even a Plan may require this access during provider refresh.

The currently published editor supports only the Standalone contract.
The following rules are requirements for extending the common model;
they are **not yet an implemented SNA reachability check**:

- Configurations may be edited and saved even if an
  execution phase is not yet supported on the available Runner.
- Before dispatch, the backend must check the required providers and execution
  phases. A private Kubernetes/Helm phase remains blocked without a suitable Runner;
  the UI explains why and refers to #37.
- Today's complete root run is not an already implemented
  infrastructure-only workaround. Phase separation belongs to #37.
- No automatic switch to public cluster APIs, no TLS bypass and
  no implicit tunnel solution as a substitute for the missing network path.
- Regional cluster assignment (#80) and network reachability (#37) are checked
  separately. Resolving one limitation does not eliminate the other.

<a id="abnahme-und-pflege"></a>
## Acceptance and maintenance

- [x] Check existing open and closed issues for overlap.
- [x] Record additional confirmed limitations with source evidence as #80–#83.
- [x] Document private Kubernetes access as a separately resolvable topic.
- [ ] Implement a capability catalogue with engine version, issue reference and execution phase.
- [ ] Test server-side execution blocks and understandable UI explanations.
- [ ] After resolving #37, qualify the private Runner path including DNS, routing, TLS and
  authentication before Plan/Apply; do not treat timeouts as drift.
- [ ] Mark resolved Accelerator issues as supported in the Configurator only after an
  engine upgrade and its own contract tests.

First check new limitations against existing issues and the current Accelerator version.
New issues include affected inputs, source evidence, expected and
actual behavior and verifiable acceptance criteria. Credentials and
customer-specific configurations do not belong in issues.

Addition: #84 was discovered during the common import/export contract test and
also confirmed on `main`. A native variable contract test explicitly expects this
validation error until the template is corrected and approved.


<a id="vpn-zuordnung-bei-mehreren-snas"></a>
## VPN assignment with multiple SNAs

[#85](https://github.com/stackitcloud/stackit-landing-zone/issues/85): VPN gateways
and all configured connections are replicated to every SNA of a connectivity
module. Selective or different configuration per SNA is missing.
Checked against `main` at `2bb7c755692674ad619ffc46a0a17a781f019106`; #64 concerns
a different matter (inter-region connections). The VPN assistant explains
the actual scope and does not offer an ineffective SNA selector.


<a id="bgp-für-stackit-vpn"></a>
## BGP for STACKIT VPN

[#86](https://github.com/stackitcloud/stackit-landing-zone/issues/86) records the
missing support for `BGP_ROUTE_BASED` in the Accelerator. #23 is closed
and covers the general VPN implementation; #64/#85 are different limitations.
The code mentions a historical provider issue up to 0.104.0. Whether it still exists
under the now-pinned provider 0.114.0 must be reproduced.
The issue covers gateway/tunnel BGP settings, routing validation,
SNA route propagation and later Configurator integration. General
management of additional SNA routing tables is distinct from this.

<a id="bastion-und-observability-komponentenbeziehungen"></a>
## Bastion and Observability: component relationships

- [#87](https://github.com/stackitcloud/stackit-landing-zone/issues/87): Although `debug-bastion` is a separate module, the root calls it exclusively through platform Kubernetes with its project and SNA network. An independent bastion component needs its own root contract and explicit migration of existing resources.
- [#88](https://github.com/stackitcloud/stackit-landing-zone/issues/88): The Kubernetes module currently creates its own Observability instance when monitoring is enabled. It does not reference the central instance in the management project. The desired selection of an existing/centrally defined instance requires reference fields, outputs and checks of permitted project/region relationships. No silent conversion of existing resources.

The [SKE documentation](https://docs.stackit.cloud/products/runtime/kubernetes-engine/how-tos/monitor-your-clusters/) describes selecting an existing Observability instance. This does not yet prove that every instance from another project is usable. SKE system monitoring, application metrics and Telemetry Router remain separate tasks. The UI identifies actual deployment locations and current limitations.
