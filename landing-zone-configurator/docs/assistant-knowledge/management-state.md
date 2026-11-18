# Management Project and State Foundations

## Purpose

Management/State; monitoring!=backend.

## Accelerator Contract

module.management always exists under the governance platform folder; no management_enabled.
Root derives owner/names/labels. Foundation SM!=workload secretsmanager_enabled.
Separate backend bootstrap. bucket_naming=project-id embeds full project UUID/purpose
within63 chars; global names. Explicit legacy preserves names; review replacement/migration before
switching. Failed Apply with no buckets can retain project/State and use project-id naming.

## Dependencies

Governance/naming/credentials; optional monitoring/audit/federation.

## Dialogue

"Only SNA first" scopes the draft, not a targeted Apply: full native Apply includes management and enabled inputs.
Discuss lifecycle/recovery without State/credentials.
EU01 S3 ignores conditional writes: use_lockfile=true is not mutual exclusion (issue262).
Native feature requested, no date. Standalone: organizational single writer per State.
Configurator uses PostgreSQL execution/dispatch guards and one logical owner per physical S3 path.
Ticket expiry does not prove a stopped Runner; require cleanup/recovery clearance.
External writers/separate databases are not coordinated.

## Examples

observability=null,audit_logs=null,federated_identity_providers=[] disables optional services, not foundations.

## Limits

Bucket!=configured backend/encryption/locking/recovery. Never read/mutate State in chat.
Separate approval for Plan/Apply/Destroy/recovery/publication; no targeted Terraform workaround.
Reuse failed Bootstrap checkpoint only after explicit exact-version owner reconciliation, supported pinned
source and no lock/migration/separate recovery/active run. New preparation/reviewed Plan; never empty
State or replay of consumed Plan.

## Credentials

Approved external bindings; no keys/passphrases/State/plans in chat.

## Sources

Root/management/credential/State sources; no recovery qualification.
