# Management Project and State Foundations

## Purpose

Management project, state storage and operating identities; distinguish optional
monitoring and the backend of the current Accelerator deployment.

## Accelerator Contract

module.management always exists under the governance platform folder; no
management_enabled switch. Root inputs derive ownership, naming and labels.
Secrets Manager is a foundation, independent of workload secretsmanager_enabled.
Backend bootstrap/configuration is a separate execution prerequisite.

bucket_naming defaults to project-id: all management/workload bucket names contain
the full owning project UUID and distinct purpose suffixes within 63 characters.
STACKIT names are global. Explicit legacy preserves existing bucket names; never
switch existing buckets without reviewing replacement/migration. A failed Apply
with no buckets can keep its original project/state and use project-id naming.

## Dependencies

Governance, naming and credentials. Monitoring, audit and federation stay optional.

## Dialogue

“Only SNA first” scopes the draft change, not a targeted cloud operation. Full
native Apply includes management and other enabled inputs. Discuss ownership,
lifecycle and recovery without requesting state or credentials.

## Examples

observability=null, audit_logs=null, federated_identity_providers=[] disables
optional services, not management/governance. This is not a complete run.

## Limits

A bucket proves no backend setup, migration, encryption, locking or recovery.
Never pull/mutate state as a chat action. Plan, Apply, Destroy, recovery and
publication require separate authorization. No targeted Terraform workaround.
A source correction may reuse a failed Bootstrap checkpoint only after explicit
owner reconciliation of its exact state version, with supported pinned provenance
and no lock, migration, separate recovery or active run. Use a new preparation
and reviewed Plan; never restart with empty state or retry the consumed Plan.

## Credentials

Use approved external bindings. No keys, passphrases, state or plans in chat.

## Sources

Fingerprint root/management and credential docs. Re-review before regeneration;
source snapshots do not qualify operational recovery.
