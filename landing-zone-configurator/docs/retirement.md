# Staged landing-zone retirement

[English](retirement.md) | [Deutsch](retirement.de.md)

The [lifecycle concept](../../docs/destroy-lifecycle-concept.md) defines the ownership
and staged teardown policy. The Configurator implementation is opt-in through
`LZC_RETIREMENTS_ENABLED`; its default is `false`. Enable it only with a qualified
Runner package and surviving control infrastructure. The authorized qualification
uses a new disposable Dev landing zone. Local tests are not a production acceptance
receipt, and production activation is a separate decision.

## Owner workflow

Retirement is available directly after a successful platform Apply. It requires
neither an Application platform binding nor published Application templates.
The selection uses the current, unlocked State and its successful Apply in the
active workspace. Native folders are read from that State before the announcement
and fenced with the existing Application scopes. A verified completed S3 backend
switch remains valid even though its migration markers are retained as evidence;
open, mismatched or unproven switches remain blocked. Reading this evidence does
not run another Plan/Apply or change cloud resources.

1. Open **Deployments → Retire** (`/deployments/retire`), select the exact applied
   platform and announce retirement. This dedicated tab contains retirement
   announcements, execution approvals and purge-wait status; history remains separate.
   A reason and deletion date are required. The preparation window defaults to seven
   days; the Platform Owner may change the date before State handover. Requesters
   receive the announcement and date changes in their workspace inbox. They can
   export data or clean up their Applications; their consent or prior deletion is
   not required. Email follows each recipient's `retirement` topic preference.
2. New orders, publications, expansions, source upgrades and stale execution
   capabilities are fenced immediately. Inspect and reconcile existing writers.
   Pause does not reopen admissions; resume invalidates earlier generations.
3. After the preparation window, use the automatically opened current retirement and choose the
   acting owner's saved cleanup credential profile. The project in which the account was created is resolved
   automatically and shown under optional service-account project details after verifying the service-account
   identity against STACKIT. Existing profiles without project metadata are discovered
   using the authenticated account context and verified API responses; no re-upload or manual project ID is
   needed. Failed verification blocks handover and can be retried in place.
   Confirm surviving access,
   retention/export review and State handover. The Configurator checks organization,
   resource ownership, known children, source availability, writer stops and that
   its trusted operator project IDs and cleanup identity are outside all captured
   targets. Operator project IDs come from the deployment binding; a customer
   credential never needs access to the SaaS operator organization. The cleanup
   account, its project and its ancestry are checked with that customer credential.
4. Explicitly hand over each original Platform/Application State to encrypted
   custody in the existing Configurator database. This is one authority transfer,
   not an additional live State. Original source/backend identities and immutable
   snapshots remain recorded. Old factories and backend grants remain fenced.
   Ordinary cancellation is unavailable after this handover.
5. Remove dependent Applications first. The acting Platform Owner approves each
   source-bound native Plan with a visible list of resource addresses and IDs.
   Only the exact saved artifact can be applied, using the same Runner package,
   source revision, provider lock, State version, operator and generation. A Plan
   expires for approval after 30 minutes. Retention/export and deletion confirmations
   are required separately for every Apply.
6. For the platform, remove private-provider workloads using the original applied
   source and reachable control planes, then remove platform resources/projects
   through the reduced native retirement root. Folders and shared organization IAM
   remain managed. Requesters' never-executed orders are archived with the owner's
   reviewed platform Apply; completed Application teardown is attributed to that
   owner without impersonating the requester.
7. Wait for real STACKIT project purge. A new folder Plan and explicit Apply are
   required. Folder-delete HTTP 409 remains a failed native execution; after stop
   and State/result review, the retirement returns to `WAITING_FOR_PURGE`. Neither
   elapsed time nor an empty list proves purge. Fresh finalization must succeed
   with the expected native delete receipts. Shared organization IAM remains.
8. Completion records and requester notices persist outside the destroyed landing
   zone. There is no automatic rollback or re-creation of deleted resources.

## State, credentials and interrupted execution

Migrations 103–106 retain intent, exact State/folder/revision scopes, affected
requesters, generations, append-only events, encrypted snapshots, control grants,
HTTP-State custody and separate retirement jobs. Runtime has no direct mutation
grant on this ledger. A short transaction advisory fence orders admissions and
late credential release; it is never held throughout the multi-day purge wait.

Actual execution uses a dedicated cold Cloud Foundry job broker. It does not widen
or borrow the old requester-bound Application execution capability. Every credential
release rechecks the real approving owner/session, profile/key version, organization
access, current generation and source/package identity. Native State reads/writes use
an application-controlled, per-job HTTP backend and database lock. Plan jobs cannot
write State. A stopped-runner receipt can release only that job's own HTTP lease.

A callback alone is not a stopped-runner receipt or completion proof. Inspect the
actual matching CF app/package before progressing a scope. A stopped Plan or an
Apply stopped before its applying stage can be cleared for a new Plan if the State
version is unchanged; its missing native outcome is retained as unknown. An Apply
that entered its applying stage remains blocked without trustworthy State/result
reconciliation. A failed native Apply remains failed even if later reconciliation permits
a new Plan. A worker with an interrupted `errored.tfstate` keeps its CF task alive
until encrypted recovery upload is acknowledged; do not stop it while upload is
pending. Duplicate recovery uploads are acknowledged without repeating cloud work.
After an actual stop, the owner may review its identity/removals and explicitly
adopt that State. This requires a new Plan and never reuses the old artifact. If no
trustworthy State/receipt is available, retain the freeze and resolve recovery
instead of changing a database phase or discarding State entries.

Original S3 objects are frozen evidence after handover, not active backends. They
may prevent a management bucket from being deleted. Export required evidence and
review removal of those objects, versions and other bucket data explicitly through
their owning service. This feature does not enable `force_destroy`, bypass retention
or silently erase bucket contents. Independent control credentials and database
backups must remain available until the whole retirement is reconciled.

### Progress and failure diagnostics

The current retirement is shown separately from cancelled and completed attempts.
Each Landing Zone has its own current workflow; an older attempt never replaces
an unresolved active one. **Retirement history** is collapsed by default and loads
execution details only when an attempt is opened. Historical attempts are read-only:
they offer output and evidence, not Plan, Apply, credential or recovery actions.

Each current scope groups its phase, next action, latest run, native output and
exact deletion approval together. Completed steps and superseded runs move into
collapsed run history. Unresolved execution and State recovery stay visible even
when a newer run exists. Application scopes are shown before the platform they
block. A prepared credential grant is not requested again while it remains valid.
Pause, cancellation and explicit status checks are under **Manage retirement**;
a paused retirement presents **Resume retirement** as its primary action. Its
status, output and unresolved work remain visible, with execution and automatic
completion checks suspended until resume. Credential renewal remains available
under collapsed optional details. If a reported run predates a pause/resume,
its owner can explicitly check its completion. It is never reconciled automatically
across generations, and its old Plan is not offered for deletion approval; create
a fresh Plan after the unresolved run has been closed.

Keep the retirement steps open to follow the active job. Status and OpenTofu
output refresh automatically. Output uses the same live NDJSON transport as
Platform and Application Plan/Apply, including reconnects and access checks during
the stream. A cold runner may need up to five minutes to copy its package before
OpenTofu starts; observing that copy does not retry or start a second job. A
startup failure has no native execution receipt and is shown separately from
an OpenTofu failure. Each job retains its own bounded, redacted output;
raw State and machine-readable saved-plan JSON are never displayed. Older jobs
created before output capture was available can have no retained output.

The step list shows service/control-plane cleanup, project removal and deferred
folder deletion. Review the actual deletion list from the successful native Plan
before approving Apply; technical source and provider evidence is available under
optional details. While the steps are open, the app automatically verifies the
matching runner and result after your job reports completion. A temporarily
unavailable completion check is retried and shown as pending; deletion approval
stays disabled until the existing server-side checks succeed. No extra runner-stop
action is required, and this check never starts a Plan or Apply. Runs without a
native outcome and interrupted State recovery still need an explicit status or
recovery review; pending recovery uploads are never stopped automatically.

Snapshot checks use the exact authoritative HTTP State document. `tofu state pull`
can normalize or reorder `check_results`; that representation is used for inventory
verification, not as a byte-equivalent witness. The same authoritative document
check binds post-Apply receipts, and State version/locking and deletion approvals
remain enforced.

## API and deployment contract

Browser APIs require one resolved session, the explicit workspace header and
CSRF/origin checks for mutations. Application Owners see only affected notices;
execution controls require the platform role and fresh verified organization access.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/retirements`, `/candidates` | Scoped status and exact applied platform selection |
| `POST /api/v1/retirements` | Announce intent, date, notifications and durable admission freeze |
| `POST /api/v1/retirements/:id` | Generation-bound inspect, pause, resume, pre-handover cancel or reschedule |
| `GET /api/v1/retirements/:id/execution` | Safe scope/job summaries; no credentials, raw State or raw Plan |
| `GET /api/v1/retirements/:id/jobs/:jobId/output` | Read workspace-authorized, redacted native output for one job |
| `POST /api/retirement-runner/output` | Publish bounded progress under the one-job runner capability |
| `POST /api/v1/retirements/:id/credential-project` | Resolve and verify the selected profile's account project; no State handover or execution |
| `POST /api/v1/retirements/:id/prepare` | Verify independent control and explicitly hand over State |
| `POST /api/v1/retirements/:id/plans` | Source-bound native Plan for an eligible scope |
| `GET .../:id/jobs/:jobId/preview` | Exact resource deletion list |
| `POST .../:id/jobs/:jobId/apply` | Explicit saved-artifact approval |
| `POST .../:id/jobs/:jobId/inspect` | Verify runner stop, persisted State and result before progression |
| `GET` / `POST .../:id/jobs/:jobId/recovery` | Review / explicitly adopt interrupted State after stop |

`/api/retirement-runner/*` is a separate one-job capability API; browser cookies do
not authorize it. HTTP-State credentials are scoped to that job and State only.
Source/artifact/State changes, additional resources and refresh-time disappearance
are rejected. Public responses and logs exclude raw native plans and private State.

The release workflow carries `LZC_RETIREMENTS_ENABLED` from the environment's
explicit variable and binds `LZC_RETIREMENT_CONTROL_PROJECT_IDS` to the operator's
`LZC_PROJECT_ID`. Staging always disables retirement. Runtime startup rejects an
unqualified/missing package or execution dependency. Production remains disabled
unless separately enabled and approved; no automatic production rollout is implied.

## Limits and qualification

The initial automatic capture is bounded to 100 dependent Applications and 64 MiB
aggregate plaintext evidence. Larger or shared/ambiguous scopes need separate batch
review. Unknown provider profiles, unavailable historical source revisions, projects
outside captured folders, unknown child projects or missing control-plane reachability
block execution instead of broadening the scope. Before State handover, Kubernetes/Helm/OPNsense workloads are refused by the hosted
CF profile; clean them up with their original reachable environment first. Hosted
private-provider cleanup is limited to the packaged Vault/Grafana profiles. Original
Terraform registry identities require a separately reviewed OpenTofu migration before
handover. Frozen inputs must also be reconstructible before custody changes.
Private SNA-only control planes still require an original reachable execution environment; Cloud Foundry does not
become an SNA runner through this feature.

The independent [OpenTofu runbook](../../src/retirement/README.md) applies to landing
zones created without the Configurator. It needs no import, Configurator database
or extra backend service; use the same original State and a surviving backend.
Its organizational single-writer procedure replaces the Configurator admission fence.

Local verification includes offline guards, real pinned-provider loopback tests,
PostgreSQL authority/custody/approval/recovery journeys and desktop/mobile UI review.
CI also initializes the worker's generated HTTP backend with pinned OpenTofu and
applies a saved synthetic Plan using a fresh job credential. This verifies State
locking, credential rotation and deletion without cloud access.
These checks do not mutate real STACKIT resources. Record real Dev results separately,
including any outstanding project-purge wait; never describe a waiting retirement as
completed. Preserve all existing demo environments during that qualification.
