# Application execution lifecycle

[English](application-execution-lifecycle.md) | [Deutsch](application-execution-lifecycle.de.md)

An Application order represents an existing instance, including its project and
State identity. A Configurator update does not turn it into a new order. Its
published template remains the immutable origin. Template and platform upgrades
record a separate effective binding; they never rewrite that origin.

## Continue an existing order

Open the order details. **Updates → Execution version** distinguishes the original template
revision, the desired execution revision and the revision of the last successful
Apply. Drift, new Plans and maintenance use the desired revision, rather than the
current default used when publishing new templates.

The Runner package contains reviewed historical Accelerator sources, their exact
provider lockfile, OpenTofu version and execution contract. The current patched
Worker verifies the packaged manifest and source digest before materializing
credentials or running OpenTofu. It does not download arbitrary Git revisions at
runtime. Historical native sources do not require additional permanently running
CF apps: the central pool can remain at one ready Runner.

Publishing a new template version does not silently rebind existing orders.
A new product release also invalidates an old saved Plan if its exact Runner
artifact binding is no longer available. In that case create a fresh Plan of the
same order; do not create replacement infrastructure or reuse an old Apply plan.
Reports from an already issued valid Runner ticket remain bound to that ticket's
original package, source and lock, including across API releases.

## Upgrade the same order

1. Open **Updates → Execution version** and review the offered replacement revision.
2. Confirm that the same order and State remain in use and that the new Plan
   must be checked for changes, replacements and deletions.
3. Select **Update execution binding**. This changes the desired execution binding
   only. It starts no Plan, Apply, import, unlock or State write.
4. Create a new Plan through the normal order flow. Review the complete Plan
   and release Apply under the existing approval policy.

The requester can perform this within their existing order authorization; an
upgrade does not grant additional project permissions. Organization, target,
backend, State key, owner, parameters and template policy stay bound to the same
instance. Changing them requires the corresponding separate product flow.

A binding change requires a quiescent instance. Running or unresolved jobs,
live Runner authorizations and open recovery prevent the switch. Complete or
reconcile them first. The server rechecks the expected source and invalidates old
unused execution approvals; an old Plan cannot bypass this through a direct API
or database request.

Known historical defaults are preserved explicitly during an upgrade. In particular,
orders created with legacy bucket names keep those names through a server-derived
compatibility input; new orders retain the project-ID naming default. An upgrade
is not permission to rename or replace existing storage silently.

An upgraded desired binding is retained if its Apply fails. Recovery uses the
source of the interrupted job and a fresh Plan is required afterwards. Do not
silently switch a partially upgraded State back to an older Accelerator.
The last successful Apply revision is shown separately from the desired revision.

## Withdrawn and unavailable versions

An operator can withdraw an execution source through a reviewed migration, for
example after a security finding. This blocks new execution and credential
release for that source; it does not erase job history, reports or State.
If the original source is withdrawn while recovery is unresolved, keep the
checkpoint and lock intact. An operator must provide a reviewed compatible
recovery package; do not bypass the source fence or upgrade an uncertain State.
The order shows the reviewed replacement path. Its requester upgrades the same
order, then reviews a fresh Plan before Apply. Source withdrawal cannot be
overridden by chat, customer parameters or a browser request.

A missing package is reported separately from a withdrawn source. An operator
must restore its reviewed package or provide the reviewed upgrade path. Never
solve a package availability problem by inventing a source hash, removing source
checks or asking the requester to recreate an existing project.

The Assistant explains source upgrades with a fixed product contract so the fresh
Plan and separate Apply approval cannot be omitted by model phrasing. It does not
read the order or change its binding through chat.

## Operator contract

The reviewed contract catalog and the database execution-source registry must
agree on source, provider-lock digest, tool version, contract and replacement.
Packaging archives these exact Git commits and validates every supported native
root with the immutable provider mirror. Adding a revision is an explicit
compatibility change, with offline plan/State regression coverage, not an API
allowlist exception. A source may be supported for existing instances while new
template publications use the current default.

Execution bindings form an append-only audit trail. Jobs snapshot their effective
binding, while grants, tickets, saved artifacts and reports retain their original
source/package/lock identities. The migration identity owns registry changes;
the runtime role cannot grant itself support for an arbitrary source. Existing
State locks and recovery fences remain mandatory. See [Plan execution](plan-execution.md)
for the execution and recovery trust boundaries.

Template and platform upgrades use the separate [versioned upgrade flow](application-upgrades.md).
