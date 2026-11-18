# State locking on STACKIT Object Storage

[English](state-locking.md) | [Deutsch](state-locking.de.md)

The tested EU01 Object Storage endpoint does not enforce conditional object
creation (`If-None-Match: *`). Therefore OpenTofu's S3 `use_lockfile = true` does
not establish mutual exclusion there. A successful Plan or an existing `.tflock`
object does not prove locking works. The independent reproduction is recorded in
[issue #262](https://github.com/stackitcloud/stackit-landing-zone/issues/262).
A native service feature request exists; implementation has no announced schedule.
Do not assume support in another region without qualifying that endpoint.

## Accelerator without Configurator

STACKIT S3 remains usable for State storage when access is **operationally
serialized**. Exactly one CLI/pipeline operator may work on a given State at a
time, including Plan, Apply, Destroy, import, refresh, migration and recovery.
Separate Application States can run independently. Agree ownership and a shared
execution procedure; one workflow's concurrency group does not coordinate an
independent CLI or another repository.

The application backend example sets `use_lockfile = false` explicitly because
this endpoint cannot enforce its lock. This does not make concurrent use safe.
If organizational single-writer operation cannot be guaranteed, use a backend
with independently qualified atomic locking. Do not create a second empty State
or migrate an existing State without a reviewed procedure and recoverable backup.

## Configurator-managed executions

The Configurator serializes executions in PostgreSQL, shared by all API replicas:

- A physical S3 location (endpoint, bucket, key) belongs to one logical managed
  platform or application State. Registrations for another logical State or
  workspace are rejected, including concurrent registrations.
- Platform execution reservations and application dispatch reservations are
  atomic database operations. Separate States can run concurrently; the same
  State cannot have competing managed executions.
- Expiry of a credential/ticket is not evidence that an issued process stopped.
  Claimed cancelled/failed platform runs remain blocking until confirmed cleanup
  or explicit reviewed recovery clearance. Application reconciliation blocks
  drift and Destroy too; ticket expiry alone does not release the hold.
- Existing source, owner, tenant, saved-plan, State-version and recovery checks
  remain in force. Historical recovery evidence stays immutable.

The Runner's S3 descriptor retains `useLockfile=true` for compatibility; that
object is an additional signal, **not the synchronization mechanism**. No State
object, State key or stored plan is migrated by this change. A historical physical
State alias causes migration to fail for operator review, rather than choosing a
writer or silently rewriting ownership.

This coordination covers the managed execution paths of one Configurator
installation using its database. Independent CLI writers or another installation
with a separate database are outside it. Keep those credentials and State paths
under one execution authority; any emergency external access requires stopping
managed writers and reconciling State before managed execution resumes.

Configurator operator IaC uses its existing cross-workflow environment concurrency.
It is not protected by the customer execution database; direct operator CLI access
must follow the same single-writer procedure.
