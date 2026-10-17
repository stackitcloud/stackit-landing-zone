<a id="stackit-produktkataloge-im-editor"></a>
# STACKIT product catalogues in the editor

[English](cloud-product-catalogues.md) | [Deutsch](cloud-product-catalogues.de.md)

<a id="zweck-und-aktueller-umfang"></a>
## Purpose and current scope

In primary STACKIT login mode, the editor automatically loads product options using the Platform Engineer's already stored technical STACKIT service-account credentials. No additional profile, project or region selection is needed for the catalogue. In legacy GitHub mode, explicit selection of an own profile and reference project remains. Central Configurator deployment credentials are never used. Choices support drafting, but replace neither Accelerator validation nor an actual Plan or quota check.

<a id="automatischer-abruf-im-stackit-modus"></a>
## Automatic retrieval in STACKIT mode

`POST /api/v1/cloud-catalogues/automatic` accepts only `region` and
requires origin, CSRF and the `x-lzc-tenant` header matching the session.
The server selects the latest own credential profile of the active tenant and
checks metadata against the stored key. Personal credentials are not
transferred to another tenant and no new permission to access
others' profiles is granted. Existing approval gates for organization tenants
remain; this does not introduce tenant-wide shared platform credentials.

The organization comes from the active tenant or last successful
profile check, never additional browser parameters. The technical token is used to
query `GET https://resourcemanager.api.stackit.cloud/v2/projects` with
`containerParentId`, `limit=100` and `offset=0`. The first active project
in sorted UUID order serves as reference. Without a direct project,
folders within the same organization are searched with bounds. Each list is limited to
its first page. Another project with better product permissions
is not automatically sought when product retrieval fails.

Without a readable active reference project, `projectId=null` remains: project-specific
catalogues are marked unavailable, while region-specific catalogues are loaded
independently. The editor loads `eu01` and `eu02` separately and preserves existing
values and manual inputs on error. Application Owners start no
technical catalogue or credential queries and need no setup for them.
Retrieval starts in the active workspace before the editor opens and is refreshed
after successful credential actions. Loading and partially missing catalogues
are displayed in the editor. Organization projects are also searched in subfolders:
at most 32 containers, 100 entries per list and a 15-second search budget;
no cross-organization fallback search. Cycles are skipped.
On 2026-10-02, real Resource Manager/product retrieval with a stored
organization-tenant profile was demonstrated; browser flows continue to use
controlled responses.

<a id="produktumfang"></a>
## Product scope

- [x] Git performance tiers: project-specific flavors marked `available`.
- [x] VPN performance tiers: region-specific `planId` values with display names.
- [x] SKE: supported Kubernetes versions, node-pool machine types, operating systems with at least one supported image version, availability zones and volume types per region.
- [x] Firewall appliances: IaaS machine types and primary/HA replacement zones, for single and multiple firewalls including regional configurations.
- [x] Displayed dropdowns preserve existing/imported values; missing values are marked as not in the loaded catalogue, never silently replaced.
- [x] Separate error handling per product. Missing API permissions or unavailable catalogues permit manual input; this is not successful cloud validation.
- [x] No catalogue persistence, no browser tokens, no shared cache across users/tenants. Changing user or tenant clears the context.
- [ ] Further catalogues for databases and additional products after product-specific review.
- [ ] VPN availability zones through a source documented for VPN. SKE zones are explicitly **not** offered as VPN zones.
- [ ] Automatic fresh cloud validation before Plan, considering target project, region, permissions and quotas.
- [x] Separate regional catalogues for eu01 and eu02 in STACKIT mode; legacy mode retains manual region selection.
- [x] Live retrieval with the user-stored tenant-bound credential profile: eu01 supplies, among other things, 2 Git flavors, 3 VPN plans, 2 Kubernetes versions, 133 SKE machine types and 12 Observability plans. The separately checked default image endpoint returns 89 public available images; this is not full deployment acceptance.

<a id="apis-und-quellen"></a>
## APIs and sources

Verification status 2026-10-01, official STACKIT Go SDK, commit `7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`:

| Product | Read-only endpoint | Response fields used |
|---|---|---|
| Git | `GET https://git.api.stackit.cloud/v1beta/projects/{projectId}/flavors` | `flavors[].id`, `display_name`, `availability` (`available`, `unavailable`, `internal`, `deprecated`) |
| VPN | `GET https://vpn.api.stackit.cloud/v1/regions/{region}/plans` | `plans[].planId`, optional `name` |
| SKE | `GET https://ske.api.stackit.cloud/v2/regions/{region}/provider-options?versionState=SUPPORTED` | `kubernetesVersions[].version/state`, `machineTypes[].name`, `availabilityZones[].name`, `volumeTypes[].name` |

Sources: [Git API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/git/v1betaapi/api_default.go), [Git Availability](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/git/v1betaapi/model_flavor_availability.go), [VPN API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/vpn/v1api/api_default.go), [VPN Plan](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/vpn/v1api/model_plan.go), [SKE API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/ske/v2api/api_default.go), [SKE Provider Options](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/ske/v2api/model_provider_options.go).

Global/regional APIs do not prove that all values can be ordered in a specific future project. The reference project for Git, Observability and IaaS is explicitly not the target project to be created. The catalogue API version is independent of the pinned Terraform provider version; a catalogue entry does not automatically confirm its support by the Accelerator.

<a id="sicherheits--und-fehlerverhalten"></a>
## Security and error behavior

`POST /api/v1/cloud-catalogues` requires an active session, same origin and CSRF token. The operation performs only token exchange and read-only product queries. UUIDs and region (`eu01`/`eu02`) are strictly validated. Server-side credential-profile queries explicitly use user ID and tenant ID plus PostgreSQL RLS. The Secrets Manager key must match profile metadata. Browsers receive normalized catalogue data only.

All cloud targets are fixed; redirects are forbidden, responses limited to 2 MB and requests have a 15-second timeout. Error messages contain no provider responses, private keys or tokens. Unknown/invalid response schemas mark only the affected catalogue unavailable. An existing but empty catalogue differs from failed retrieval.

Previous manual profile selection applies in the personal legacy workspace.
In STACKIT login mode and organization tenants, retrieval is automatic.
Platform Engineers may store own credentials and retrieve catalogues in
organization tenants; Application Owners may not. Migration `013_organisation_credentials.sql`
enforces the same product-role check in PostgreSQL RLS. Profiles remain bound to
tenant and owner, not shared tenant-wide; personal profiles are
never transferred into an organization tenant. Cloud execution remains separately blocked.
Without organization context, projects accessible to the service account are queried
in the personal tenant. In organization tenants, the organization ID
limits the search. Missing catalogue access is visibly reported,
not silently treated as a successful free-text fallback.

In legacy mode, catalogue credentials, reference project ID and region are stored in this browser per user
and workspace and restored on reopening.
Only these three selection values are stored, no keys,
tokens or catalogue responses. The profile is rechecked against accessible
stored credential profiles; a deleted profile is no longer
preselected. Catalogues are still retrieved only after explicit refresh.
The setting is not synchronized between devices; blocked
browser storage produces a visible notice.

<a id="erweiterung-observability-und-diagnose-bastion"></a>
## Extension: Observability and diagnostic bastion

- [x] `observability.plan_name` and Observability blocks of platform clusters, Landing Zones and sandboxes use `plans[].name` as Terraform input, not the different plan UUID.
- [x] IaaS machine types, public available images and IaaS availability zones for `platform_kubernetes[*].debug_bastion`. Catalogues are separate from SKE node pools.
- [x] Existing values and manual input on failure are preserved; new API response fields are optional for compatible older responses.
- [ ] Verify Observability plan catalogue for eu02. The publicly documented regional base is `argus.api.eu01.stackit.cloud`; deliberately no eu01 catalogue is offered for eu02. The global base is also documented, but without parameters/guarantees for a region-specific plan list.

| Catalogue | Source | Response |
|---|---|---|
| Observability | `GET https://argus.api.eu01.stackit.cloud/v1/projects/{projectId}/plans` | `plans[].name`; mapping by plan name as in the Accelerator |
| Bastion machine types | `GET https://iaas.api.stackit.cloud/v2/projects/{projectId}/regions/{region}/machine-types` | `items[].name` |
| Bastion images | `GET https://iaas.api.stackit.cloud/v2/projects/{projectId}/regions/{region}/images` | `items[].id` as value, `name` as display, `status`, `scope`; select only `AVAILABLE` and `public` |
| Bastion zones | `GET https://iaas.api.stackit.cloud/v2/regions/{region}/availability-zones` | `items[]` |

Sources: [Observability OpenAPI](https://docs.api.eu01.stackit.cloud/oas/argus/version/v1), [IaaS v2 API](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/api_default.go), [Image model](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_image.go), [Machine types](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_machine_type_list_response.go), [Zones](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_availability_zone_list_response.go).

The reviewed IaaS v2 list methods offer no cursor/page parameters, and response models no continuation markers. `all=true` timed out during real retrieval; the default endpoint returned 89 public `AVAILABLE` images. Exactly identical filtering to the portal is not yet proven. Response sizes above the existing limit or more than 2,000 entries are not silently truncated: the affected catalogue is treated as unavailable. Private, organization-shared or project-shared images of the reference project are not proposed as selectable images because their usability in the newly created target project is unproven. Existing image IDs are preserved in the draft. OS suitability, required tools and image/flavor compatibility still need checking before deployment.

<a id="auswahlfeld-prüfung-2026-10-02"></a>
## Selection-field review 2026-10-02

The inventory is based on generated Terraform input definitions and
actual editors, not invented product fields.

| Field group | Source and result |
| --- | --- |
| SKE version, nodes, OS, zones, storage | Regional SKE `provider-options`; `machineImages[].versions[].state=SUPPORTED` for OS. SKE is under `platform_kubernetes` in the current schema, not in Public/sandbox project templates. |
| Bastion image, VM type and zone | IaaS v2 catalogues; image only public and available. |
| Firewall type, primary and HA zone | Same IaaS catalogues; no reuse of SKE values. |
| Git, VPN plan, Observability, project roles/permissions | Existing product-specific catalogues; separate regional error states. |
| DNS zone type | Fixed selection `primary`/`secondary` from DNS v1 OpenAPI `zone.ZonePost`; no dedicated live catalogue documented. |
| VPN encryption, integrity, DH groups | Fixed enums from VPN v1 OpenAPI `Phase`; no algorithm catalogue documented. SHA-1 is deprecated there as of 2026-12-31; no automatic preselection of weak algorithms. |
| VPN tunnel zones | The reviewed VPN v1 OpenAPI contains no zone-list method. Free input remains; SKE/IaaS zones are not proof of VPN availability. |
| Regions, routing mode, resource type, secret policy | Existing bounded choices; new API values are added only when supported by the Terraform module. |
| Names, CIDRs, DNS names, labels, Kubernetes images, principals | Draft values or customer references, not STACKIT product catalogues. Do not offer existing resources from the reference project as resources of the future target project. |
| KMS key version, Kubernetes storage class | Belong to separately created key/cluster configuration. No unchecked catalogue from unrelated existing projects; later verification in the actual target context is required. |

Sources for new fixed choices: [DNS v1 OpenAPI](https://docs.api.eu01.stackit.cloud/oas/dns/version/v1),
[VPN v1 OpenAPI](https://docs.api.eu01.stackit.cloud/oas/vpn/version/v1),
[SKE v2 OpenAPI](https://docs.api.eu01.stackit.cloud/oas/ske/version/v2).

<a id="projektrollen-und-permissions"></a>
## Project roles and permissions

Read-only catalogue retrieval additionally uses Membership API v2:

| Catalogue | Endpoint | Normalized fields |
| --- | --- | --- |
| Project roles | `GET https://authorization.api.stackit.cloud/v2/project/{projectId}/roles` | `roles[].name`, `description`, `permissions[].name` |
| Project permissions | `GET https://authorization.api.stackit.cloud/v2/permissions?resourceType=project` | `permissions[].name` |

Source: official SDK revision `7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`,
`services/authorization/v2api`. The role-list response must belong to the requested
project ID and resource type `project`. Both catalogues remain
unavailable on missing permissions independently of other product catalogues.
API responses remain time- and size-limited and contain
no tokens in the browser. IAM options are project-specific, not region-specific.

The editor offers permissions as dropdowns and copies role templates as local
definitions. Reference-project role IDs are not passed on, and other
project members are not queried. The application does not yet verify personal
STACKIT identity through this catalogue: future role variables need the separate
verified instantiation context. Actual orderability and role resolution
in the new target project remain a gate before production publication.

<a id="pim-zentrale-produktinformationen-keine-alleinige-auswahlvalidierung"></a>
## PIM: central product information, not sole selection validation

The public [STACKIT PIM API v2](https://docs.api.eu01.stackit.cloud/documentation/pim/version/v2) is indeed a central catalogue for categories, products and SKUs. The [OpenAPI specification](https://docs.api.eu01.stackit.cloud/oas/pim/version/v2) documents, among other things:

- `GET https://pim.api.stackit.cloud/v2/products`
- `GET https://pim.api.stackit.cloud/v2/products/{productId}/skus`
- `GET https://pim.api.stackit.cloud/v2/skus`
- SKU attributes such as region, technical features, product maturity and deprecation, plus article numbers for billing.
- Publicly available lists with cursor pagination (`pageSize` maximum 100). The adapter follows subsequent pages within explicit time/page limits and discards incompletely retrieved lists.

PIM is suitable as a supplementary source for consistent product names, technical explanations and SKU mapping. Its public SKU lists confirm neither orderability nor entitlement in a specific project, quotas, current Kubernetes versions or available VM images. Therefore the respective product APIs remain the source of technical selection values. The v1 marked as retiring in the API overview is not newly integrated.

<a id="assistent-aktueller-pim-v2-abruf-2026-10-10"></a>
### Assistant: current PIM v2 retrieval (2026-10-10)

Editor chat and preceding template advice reload product catalogues per message
through the same user-/tenant-bound abstraction as the editor,
plus public PIM data. Chat uses the configuration region;
template advice queries eu01 and eu02 separately. No shared
user/tenant cache and no operator-credential fallback. Failure of the
authorized product catalogue does not prevent explaining public PIM facts,
but is not proof of a selectable plan.

Implemented: products and SKUs filtered by product/region, cursor pagination
with 100 entries per page, at most 30 pages and a 15-second budget per list.
Relevant product scope is bounded (at most eight products), not the whole
STACKIT catalogue. Real eu01 retrieval: Kubernetes Engine, VPN, Observability,
Server and Git, 330 SKUs in total; VPN with 100, 500 and 1000 Mbit/s.
Real eu02 retrieval returns the same five product names and 129 SKUs,
including no VPN SKUs. This is no reason to offer eu01 VPN plans for eu02.

The model receives normalized labels/values and public technical attributes,
no credential profiles, IAM roles/permissions, reference project IDs, keys,
prices or raw responses. Context limits: 50 options per product catalogue and
100 prioritized PIM SKUs per region, each with total count/subset marker
and retrieval time. Thus no promise of complete or continuously available lists.
The SKU ID is a billing article number, not the VPN plan ID; map
technical selection values only through planId/flavor and authorized product options.

For questions about VPN performance tiers and flavors, a deterministic,
bounded fact list supplements model text because Qwen omitted numbers in real tests
despite supplied context. Deprecated entries are excluded;
bandwidth/connection count/vCPU come from supplied attributes. The RAM unit
is not yet verified and is not claimed to be GB. The fact list is
currently German. Technical ID fields are not permissible follow-up questions.
Free-form domain advice, bilingual presentation and complete complex
configuration changes remain separately subject to qualification.
