# Retirement integration

[English](retirement.md) | [Deutsch](retirement.de.md)

The [lifecycle concept](../../docs/destroy-lifecycle-concept.md) defines the complete
target behavior. The current implementation is a guarded foundation, not an enabled
Platform Destroy feature. `LZC_RETIREMENTS_ENABLED` defaults off. Do not enable or
promote it as a complete execution workflow until the remaining coordinator and
source-bound Runner integration are qualified. Production activation is separate
from the authorized disposable Dev qualification.

## Implemented contracts

Migration `103_platform_retirements.sql` stores retirement intent, exact State
binding, exported platform revisions/folder scopes, affected requesters, generation
and append-only events outside the target cloud resources. The Platform Owner needs
both the platform role and fresh verified organization access. The preparation window
defaults to seven days and can be selected before announcement. Starting retirement
atomically closes admissions; existing execution is reconciled rather than assumed
stopped. Unknown outcomes and recovery holds prevent cancellation.

A common transaction advisory lock orders retirement against new orders,
publications/imported contracts, platform sources, source upgrades, Application jobs,
tickets, claims, backends, dispatches, Platform jobs and credential consumption. It
is held for the short admission transaction, never during a purge wait. Existing
writers may already hold cloud credentials; the fence does not cancel those calls.
Destroy requests require the current generation. Pausing/resuming invalidates older
prepared capabilities. A retiring physical folder cannot be made orderable simply
by copying a publication to a different revision. Shared or unresolved State ownership
requires review instead of combining deployments.

Requesters receive a persistent workspace inbox notice, including after the original
order is archived. Email uses the `retirement` preference topic and selected language;
existing preferences and defaults remain unchanged, so this new topic is opt-in.
An email preference or delivery failure never removes the inbox notice. SMTP handoff
is neither user consent nor proof of inbox delivery. The Platform Owner decides;
requester consent or prior self-service deletion is not the default prerequisite.

Authenticated APIs require the explicit workspace header, one resolved session
identity, and CSRF/origin checks for mutations:

| Endpoint | Effect |
| --- | --- |
| `GET /api/v1/retirements` | Role-scoped status; Application Owners see only their affected Applications |
| `GET /api/v1/retirements/candidates` | Verified Platform Owner selects an applied State binding |
| `POST /api/v1/retirements` | Confirm intent, reason and optional `notBefore`; persist notice and freeze together |
| `POST /api/v1/retirements/:id` | Generation-bound `inspect`, `pause`, `resume` or pre-destruction `cancel` |

The execution-history view provides the Platform Owner controls. Application views
show affected users the current notice without teardown controls. Templates expose
the derived `platformRetiring` flag; normal orders and stale Apply plans are blocked
server-side even if the browser is stale. Draft editing is not execution authority.

## Private preparation evidence

Migration `104_retirement_inventories.sql` and the internal `RetirementCapture`
service capture the authoritative Platform State and the exact last-applied
Application backend/source bindings. The acting Platform Owner retains their own
identity; no requester session or credentials are impersonated. Captures are
immutable, generation/context-bound and encrypted separately for State, inventory
and source. Backend reads happen outside the admission transaction and repeat before
an atomic all-scope commit. Pause, source changes or unresolved writers reject the
capture. This internal preparation service is not an exposed execution endpoint and
does not move backend authority or grant Destroy permission.

The Node-only native checks accept known private providers for inventory, require a
separate private-workload deletion with the original source, and refuse infrastructure
removal while those resources remain. Native Plans must be deletion-only, match the
captured identities, and account for the current State. Disappearance during refresh,
an omitted managed resource, an unreviewed partial deletion, and a reported successful
Apply without the expected State transition all fail validation. These checks do not
prove API authorization, surviving control access or physical project purge.

## Remaining execution integration

The foundation currently reaches preparation/draining states. It does **not** yet
provide administrative cross-requester Application Destroy, captured cloud inventories
and surviving-control verification, phase-bound native Plan/Apply dispatch, purge
observations, deferred folder finalization, completion notifications, or batch cleanup.
The existing requester-bound Application Destroy path is not impersonated or widened.
These pieces must retain real acting-owner/requester attribution, original State and
source/provider bindings, encrypted artifacts, reviewed scope and fresh authorization.
Do not use a database phase update or an uploaded State file as completion evidence.

The independent [native OpenTofu adapter](../../src/retirement/README.md) provides the
operator-assisted route for its qualified provider profile, without importing into
the Configurator. It is not silently used by this API before Runner integration.
Historical private-provider workloads require original reachable control planes.
Folder deletion remains bounded by actual STACKIT purge; no timer guarantees success.

## Qualification

Unit/HTTP tests cover session, workspace, CSRF and error boundaries. PostgreSQL
integration covers durable intent, seven-day scheduling, scope isolation, admission,
stale Platform tickets, pause generations, shared ownership and notices after archive.
Desktop/mobile browser checks cover English text, explicit confirmation and pause.
Native tests include the real pinned provider against an isolated loopback API:
same-State project deletion, retained folders, rejected HTTP-403 false disappearance,
HTTP-409 failure and later successful folder finalization. No cloud credentials or
real resources are used in these checks.

The Dev pilot must use a newly created, clearly named disposable Landing Zone and
leave existing demo deployments untouched. Completion of local checks alone does
not authorize a production release or establish full live qualification.
