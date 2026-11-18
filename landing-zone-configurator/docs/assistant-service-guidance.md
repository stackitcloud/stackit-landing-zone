# Assistant service guidance

[English](assistant-service-guidance.md) | [Deutsch](assistant-service-guidance.de.md)

The Assistant combines reviewed service knowledge with the current user's scoped
project catalogues. Catalogue access alone is not a sizing recommendation:
flavor names do not prove capacity, price, entitlement or suitability.

Every topic follows the same consultation policy: establish the goal and only
relevant missing requirements, retain answered decisions, explain reviewed
tradeoffs, and offer concrete choices. A request for a reasonable starting point
can delegate a documented recommendation; it cannot supply unknown networks,
credentials or permissions. Unsupported recommendations need a focused business
question, not a request to research internal identifiers. Services without a
flavor use appropriate decisions such as retention, availability or access.


Documented limits take precedence over a starting recommendation. For Git, the
reviewed plans allow at most 10/100 users per instance; automatic storage growth
does not increase those limits. A requirement above 100 users opens an architecture
question about separate team/project instances or a smaller initial scope before
another flavor selection. Separate instances do not imply federation, automatic
load distribution or aggregated guaranteed capacity. The central `devops` input
configures one instance; additional instances require separate reviewed configuration.

## Shared catalogue selection

`packages/contracts/src/cloud-catalogue-fields.ts` is the shared field-to-catalogue
registry used by the editor, Assistant and generated scenario inventory. Do not
add a separate mapping or dropdown implementation for a new service.

| Configuration area | Catalogue-backed decisions |
| --- | --- |
| Central Git | Git plan |
| VPN | VPN plan |
| Kubernetes | Version, node machine type, operating system, zones and volume type |
| Observability | Plan and supplied retention capabilities |
| Debug bastion | VM size, image and zone |
| Firewall infrastructure | VM size, primary zone and HA backup zone |
| Native project access configuration | Project roles and permission names; existing IAM guards still apply |
| Audit, folders, DNS, network layout and lifecycle | Shared consultation policy; no invented flavor where none exists |

The scenario inventory records the catalogue binding of every native field. A new
catalogue adapter requires a registry entry, source-bound service facts and a
cross-service selector regression. Products that do not yet expose a catalogue
adapter are not silently covered by another product's flavors.

Questions explicitly distinguish business requirements from catalogue selections.
A workload or recovery question stays a business question even when its answer
will inform a flavor field; only an actual product selection receives a picker.

The server authors picker metadata after validating the model's dialogue. It uses
actual option values and labels for the selected project/region, with source age,
status and truncation information. The UI provides the conversational subset,
search over loaded options, expansion to the loaded catalogue, and selected-option
details. No value is selected automatically. Business reply choices and personal
free text remain available. Sending a selected label/value is a chat answer,
not an accepted patch or execution approval.

For pending catalogue decisions, a common renderer supplies the question and
explanation from known choices rather than displaying unverified model prose.
This prevents invented CPU/RAM/bandwidth specifications on those selection
questions. Where project catalogue data is available, provisional chat text is
held until this grounding step finishes. Existing proposals and other kinds of
advice retain their own source and validation contracts; this is not a universal
factual verifier for arbitrary prose.

## Evidence and boundaries

Public PIM facts may describe an offered option only when product, region and
flavor/plan reference match. Deprecated entries, conflicting facts and unknown
RAM units cannot become displayed capacity claims. Public PIM articles do not
make a product orderable: the selectable option still comes from the project
catalogue. Reviewed Git plan descriptions are supplied separately from live
availability.

Catalogue reads include the platform default and configured service regions.
An unavailable catalogue differs from an available empty one. Truncated lists
are labelled and cannot establish that an omitted offering is unavailable. The
model receives a bounded excerpt; picker presentation has its own option/byte
budget and retains truncation metadata. Ambiguous regional wildcard questions
must be clarified instead of using another region's offerings. No private
project UUID or credential is needed in a question to select a public plan.

Presentation metadata is stored with the scoped conversation for reloads. It is
removed before validating a stored proposal for acceptance; it cannot become a
configuration change or consent. Revision, tenant, identity, publication and
Plan/Apply checks remain separate. A later configuration change can require
resource replacement; service knowledge must describe the pinned provider's
actual behavior rather than assume every flavor can be resized in place.

## Maintenance and verification

Keep service facts in the reviewed knowledge, field bindings in the shared
registry, and rendering in the shared question component. English UI language
is explicit request metadata; English technical overviews use reviewed English
service texts instead of German fallback copy. Historical customer messages and
resource names are not translated. Legacy requests without a UI language use the
latest natural-language user answer, including short follow-ups. Firewall and SNA
questions use the same language contract.

For a confirmed draft request, an empty model response with neither changes nor
questions triggers one bounded semantic repair using the same context and schema.
It must supply a concrete typed draft or a genuinely missing question. Firewall
setup preserves an explicit request to clarify requirements without proposing
changes; the same bilingual business choices serve consultation and draft turns. All source,
scope and acceptance checks still run; the repair grants no execution permission.

Run `npm run assistant:generate`, format generated output and run `npm run check`.
Relevant tests cover every mapped service family, source/region matching,
conflicts, unavailable/empty/truncated catalogues, byte limits, and prevention of
model-authored picker data. Desktop/mobile tests exercise filtering, descriptions,
combined choices and sending without saving. Real PostgreSQL tests cover reload,
tenant isolation and acceptance of proposals carrying presentation metadata.

Real-model cases for Kubernetes, VPN and Observability require actual pending
catalogue fields and no changes before selection. Their synthetic catalogues
provide no performance figures, so the oracle rejects invented hardware claims.
As with other shared Assistant contract changes, independently repeat the complete
suite and continuous dialogue before reporting qualification. Keep failed receipts;
a field-inventory update or a skipped qualification is not evidence of dialogue quality.
