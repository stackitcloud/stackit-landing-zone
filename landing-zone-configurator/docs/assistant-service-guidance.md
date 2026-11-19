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

The [shared consultation](assistant-consultation.md) retains quoted workload
requirements and compares them with actual offerings and reviewed constraints.
For example, approximately 80 Git developers rules out Git10 and supports Git100
when listed. The recommendation remains visible while access is clarified. A later
explicit scope change can replace the requirement. This checks a user ceiling,
not workload performance; unknown characteristics remain unknown.

A request to use the Accelerator default resolves the pending field to its real
native value, including null/omission. For Git network access that is `0.0.0.0/0`,
with public reachability clearly explained. The Assistant does not ask for the
literal CIDR again or demand a second confirmation. Unknown company/VPN egress
networks are not inferred from private SNA ranges or another service's topology.
Unanswered questions alone do not authorize a public service.

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

The server authors picker metadata using actual project/region values, source age,
status and truncation. Descriptions use matched product facts. A shared evaluator
produces factual recommendation cards from source-quoted numeric requirements;
these cards are informational, not an extra acceptance step. The model keeps its
contextual explanation, rather than having it replaced by generic form copy.
Only the final validated answer is streamed to the browser.

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

The shared tool protocol allows knowledge, native configuration/default and
catalogue reads plus local proposal validation. Validation feedback returns to the
model before its final answer. No read or proposal operation grants persistence,
cloud execution or permission changes. The brief is stored privately with the
existing owner-scoped conversation and omitted from browser responses.

Run `npm run assistant:generate`, format the generated TypeScript and run
`npm run check`. The scenario JSON must retain its generator's exact output.
Relevant database tests cover private context, reload, tenant isolation, discard
and preservation. Desktop/mobile checks cover recommendation cards, choices and
completed proposals. A shared runtime change requires the complete repeated real-
model suite and continuous cross-service journey. Keep failed receipts: historical
controller comparisons and field inventory are not qualification of the new flow.
