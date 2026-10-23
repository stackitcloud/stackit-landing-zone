# Isolated recovery lab

[English](README.md) | [Deutsch](README.de.md)

This local lab is reproducible infrastructure defined in `compose.yaml`, not a
second hosted Dev deployment. It creates two digest-pinned PostgreSQL 17.11
containers with separate named volumes on an internal Docker network. There are
no published ports, API, Runner, cloud credentials, external service bindings or
mounted Docker socket. The controller uses only the local Docker Unix socket;
remote Docker context/host settings and ambient cloud credentials are not passed
through. Ordinary application services and their data remain separate.

## Build and verify

Requirements: Linux, Python 3, Docker Engine with Compose v2 and the real
OpenTofu **1.12.6** binary for interruption tests. Run from the repository root:

```sh
python3 -m unittest discover -s landing-zone-configurator/infra/recovery-lab -p 'test_*.py'
python3 landing-zone-configurator/infra/recovery-lab/lab.py selftest
python3 landing-zone-configurator/infra/recovery-lab/interrupt.py --tofu /absolute/path/to/tofu
```

The lab controller creates an owner-only `.private/` directory and random database
password. The directory is ignored by Git; neither passwords nor backup contents
are printed. `selftest` starts both services, applies the checked-in Configurator
SQL migrations to the source fixture using a separate migration role and ledger,
adds a synthetic probe, takes a custom-format backup and restores it into the
other database. Repeating it preserves the source and rebuilds only the disposable
restored database. Existing migration checksums must match.

It compares all `lzc`/`lzc_auth` tables, the migration ledger and probe contents,
plus relation owners, effective ACLs, RLS flags and function definitions/owners.
Equivalent PostgreSQL default ACL representations are normalized to effective
grants. Product roles are restored before objects; owners/ACLs are not discarded
with `--no-owner` or `--no-acl`. A mismatch fails the test. The summary reports
only success and counts, never row contents or individual table hashes.

This migration fixture validates the actual SQL schema, not a hosted release or
the API migrator itself. The existing PostgreSQL integration suite separately
checks the real application migrator, authorization and recovery flows.

## Backup, compare and lifecycle

```sh
python3 landing-zone-configurator/infra/recovery-lab/lab.py up
python3 landing-zone-configurator/infra/recovery-lab/lab.py status
python3 landing-zone-configurator/infra/recovery-lab/lab.py backup
python3 landing-zone-configurator/infra/recovery-lab/lab.py restore --backup backup-<reported-number>
python3 landing-zone-configurator/infra/recovery-lab/lab.py compare
python3 landing-zone-configurator/infra/recovery-lab/lab.py stop
python3 landing-zone-configurator/infra/recovery-lab/lab.py destroy --confirm-disposable-lab
```

`restore` accepts only a hash-verified backup generated in this lab's `.private/`
directory. It recreates only the `restored` service's `configurator_test` database.
The controller verifies project/service/management labels before accessing a
container. Destroy removes only this Compose project's containers/volumes and
retains private backup files. Stop preserves volumes. The initial image pull
requires access from the Docker host; database containers have no external routing.

Do not import a Dev/customer backup into this fixture. A future real-backup drill
needs a separate controlled import, confidentiality controls and checks of secret
and artifact references; it must not start copied queued jobs or enable cloud
execution. A database-only restore does not demonstrate Secrets Manager, S3
artifact or complete-service restoration.

## Deterministic interruption without a manual timing window

`interrupt.py` starts a real pinned OpenTofu process in a private temporary fixture
with an explicitly constructed environment, no provider downloads and no cloud
credentials. It uses only the built-in Terraform provider and local/loopback data:

1. **Plan:** a local HTTP state fixture blocks a `terraform_remote_state` read.
   The controller waits until the running Plan reaches that request, kills only
   its newly created process group, verifies no eligible saved Plan/resources were
   produced, releases the fixture and verifies a fresh Plan succeeds.
2. **Apply:** first establish a successfully persisted synthetic baseline. A new
   reviewed saved Plan then creates an additional `terraform_data` resource,
   then completes a local 21-second checkpoint gate before waiting in a dependent
   provisioner. A new state-update event after the persistence interval is needed;
   waiting inside one unchanged provisioner alone does not trigger a snapshot. The controller waits for both the
   provisioner barrier and the first resource's persisted checkpoint, kills that
   process group, then runs a fresh Plan and Apply. The retained resource must be
   unchanged and keep its original ID. No old saved Plan is replayed.

The Apply test allows 60 seconds for the observed checkpoint rather than assuming
immediate State persistence. OpenTofu documents a minimum/default persistence
interval of 20 seconds in its [environment-variable reference](https://opentofu.org/docs/v1.12/cli/config/environment-variables/#tf_state_persist_interval).
If a phase/checkpoint barrier cannot be established, the test fails instead of
claiming a successful interruption. Raw synthetic engine logs and State remain
in the private temporary directory and are removed when the fixture ends.

These are genuine local engine hard-stop tests, **not** qualification of hosted
Runner loss, live S3 locks, a lost State write, cloud reconciliation or the
Configurator's terminal-job handling. Those need separately targeted runtime tests
against an identified disposable Application instance. Never force-unlock, delete
customer State or retry an ambiguous cloud Apply based on this fixture's result.

## Hosted disposable Plan observation

`hosted_plan.py` uses an existing private CF CLI login for the isolated
`lzc-dev-runners/plans` space. It does not authenticate as an Application Owner,
create/dispatch jobs, read State or unlock anything. Keep the approved disposable
order separate from working Application instances. The Runner must first be
released with the corresponding `application_plan_observation` support; older
packages produce no matching observation and the controller times out.

```sh
python3 landing-zone-configurator/infra/recovery-lab/hosted_plan.py \
  --cf /absolute/path/to/cf --cf-home /private/operator-cf-home \
  --runner-space <dev-runner-space-uuid> --runner-template <runner-template-uuid> \
  --instance <disposable-instance-uuid>
```

The default is read-only observation. `CF_HOME` must be an owned directory with
mode `0700`, targeted at the fixed STACKIT CF API and the selected Runner space.
The controller additionally checks the actual organization/space/template through
CF, follows bounded log streams only from one-shot/warm Runner apps, and ignores
other instances, malformed IDs, observations before arming and events older than
three seconds. Its environment carries no ambient cloud credentials.

The organization/space/template boundary is verified once when arming. Immediately
before stopping, a single lookup rechecks the exact Runner app GUID and its space;
one-shot tasks additionally require the unique active task. An unverified boundary
cannot authorize a stop. Repeating organization, template and full app-list reads
inside the short Plan window is deliberately avoided. The worker observes the
bounded first native version record as its file is written, with normal output
publication retained as a fallback. Neither mechanism delays the Plan or changes
its inputs. Private receipts include intent and response timestamps for comparing
the actual stop with native completion.

For an executable template with direct deployment policy, the ordinary ordering
UI automatically starts the first Plan. Let that initial Plan finish and review
its outcome. Reuse the same disposable instance for the interruption drill:
arm the observer first, then select **Cloud-Plan starten** again in its Plan tab.
No further order or Apply is needed for this Plan drill. A first Plan that started
before arming is not retrospective interruption evidence.

Start the test Plan through the ordinary authenticated UI only after the observer reports
`observer-ready`. No extra permission or authentication bypass is introduced.
For the separately authorized stop drill, repeat the same command with
`--confirm-disposable-stop <same-disposable-instance-uuid>` and
`--receipt /private/drill-evidence/new-stop.json`. That mode can request
one stop only: cancel the unique active task of the matching one-shot job, or stop
the matching single-use warm Runner app. It never stops the template or a whole
pool. Neither mode changes the pool size or disables SSH restrictions.

The receipt directory must be owned/private (`0700`). Before any stop request, the
controller exclusively creates a `0600` receipt and flushes its exact instance,
job, Runner and optional task binding to disk as `stop-intent`. After CF responds,
the phase becomes `stop-requested`. An ambiguous response retains the intent.
Existing receipts are never overwritten, including after process restart. Review
the recorded operation before another attempt; do not discard its receipt to retry
an uncertain request. The receipt contains no credentials, Plan or State values.

The worker emits only a bounded identifier/timestamp observation after seeing the
native OpenTofu 1.12.6 version event in a **live, active standard Application
Plan**, plus a completion marker. Drift, destroy, Apply and platform jobs do not
emit these observations. No native messages, inputs, email addresses, backend keys,
secrets or State values enter these structured operator events. Identifiers/logs
remain private operational evidence and must not be pasted into public issues.

Operator and CF clocks must be synchronized. Log delivery and CF cancellation can
lose the race with a fast Plan. A stale observation or an already-received
completion marker prevents the stop. `window-missed`, timeout or
any boundary failure are inconclusive. Even `stop-requested` reports **no recovery
qualification**: verify actual Runner exit and the server's job outcome, retained
State/lock, and fresh-Plan behavior separately. It does not prove that the native
engine was still running when CF processed cancellation. Do not count a completed
Plan or a mere stop request as a successful interruption. Apply/checkpoint drills
need a separate controller and are not enabled by this tool.

## CI

The `Isolated recovery lab` job in **Validate Configurator** runs the isolation
unit tests, database restore and native interruption fixture without cloud or
Model Serving credentials. Cleanup runs even after failure. No backups or raw
engine logs are uploaded as public CI artifacts. See [#90](https://github.com/stackitcloud/stackit-landing-zone/issues/90)
and [#95](https://github.com/stackitcloud/stackit-landing-zone/issues/95) for the broader
operational acceptance boundaries.

## Initially empty local-State limitation

The first-Apply variant repeatedly produced an incomplete intermediate checkpoint
with OpenTofu 1.12.6: a completed earlier resource was absent while the later
checkpoint gate was present. It remains unqualified under [#140](https://github.com/stackitcloud/stackit-landing-zone/issues/140).
The default Apply test deliberately covers existing State and still requires the
new resource created during the interrupted Apply to survive unchanged. It does
not qualify the initially empty-State case. An optional diagnostic reproduces
that separate finding and exits nonzero when a completed resource is missing:

```sh
python3 landing-zone-configurator/infra/recovery-lab/interrupt.py --tofu /absolute/path/to/tofu --first-apply-diagnostic
```

Do not infer the local-backend result for HTTP/S3 or normally completed Applies.
Those require their own tests; do not upgrade the engine or alter State silently.

## Remote backend protocol fixtures

`remote_interrupt.py` adds the real OpenTofu HTTP and S3 backend implementations
against separate in-memory loopback services. It starts with no workload resources,
observes a checkpoint containing both completed resources, hard-stops its own Apply
process group and verifies a subsequent Plan is rejected because the orphaned lock
remains. The lock is removed only from the in-memory fixture after confirmed process
exit, followed by a fresh Plan/Apply retaining the created resource and its ID.

```sh
python3 landing-zone-configurator/infra/recovery-lab/remote_interrupt.py --tofu /absolute/path/to/tofu
```

Use `--backend http` or `--backend s3` to select one case; the default runs both.
The S3 fixture implements conditional lock creation and uses only dummy credentials.
The HTTP fixture checks lock identity on normal unlock. These tests do not validate
STACKIT service authentication, eventual consistency, real cloud locking or hosted
worker reconciliation. Fixture lock removal is not a production force-unlock tool.

Both protocol cases retained the completed resources in initially empty State; the
local filesystem backend limitation in #140 remains separate. S3 init may create
an empty State object before the first resource Apply. No backend result is inferred
for another backend. CI runs both fixtures without cloud credentials or public
raw-State/log artifacts.
