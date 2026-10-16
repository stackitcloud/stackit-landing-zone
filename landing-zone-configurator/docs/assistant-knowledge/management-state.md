# Management Project and State Foundations

## Purpose

Provide the platform's management project, Terraform state storage and base
operating identities. Distinguish these from optional monitoring services and
from the backend that stores the current Accelerator deployment's own state.

## Accelerator Contract

The root calls module.management unconditionally beneath the governance
platform folder. Ownership, naming, organization and labels are derived from
root inputs. Management implementation determines state-bucket and identity
resources; it has no independent invented management_enabled switch.
The module also creates its Secrets Manager foundation; do not equate that
instance with every workload's separate secretsmanager_enabled choice. Backend
bootstrap/configuration is a separate native execution prerequisite, not a
runtime Configurator dependency embedded into exported configuration.

## Dependencies

Governance/naming and credential foundations. Observability, audit routing and
federation are optional settings attached to management. Their knowledge
dependencies do not make those services required.

## Dialogue

Explain that "only SNA first" scopes the desired configuration change, not a
targeted cloud operation: a full native apply still includes mandatory base
resources and other enabled inputs. Ask about backend ownership, lifecycle,
retention and operating responsibility without requesting state or passwords.

## Examples

Synthetic baseline: observability = null, audit_logs = null,
federated_identity_providers = []. Optional services are disabled but management
and governance remain part of the root. This is a fragment, not a complete run.

## Limits

A created state bucket does not prove a configured backend, successful state
migration, encryption, lock safety or disaster recovery. Never read/pull/mutate
remote state as a chat action. Plan, apply, destroy, recovery and publication
have independent authorization gates; no targeted Terraform workaround.

## Credentials

Provide backend/object-storage and provider credentials through approved
external execution bindings. Keys, passphrases, state contents and plan files
must never enter model context or a knowledge file.

## Sources

Root and management implementation plus deployment-credential documentation
are fingerprinted in the manifest. Re-review resource/bootstrap changes before
regeneration; no source snapshot proves operational recovery qualification.