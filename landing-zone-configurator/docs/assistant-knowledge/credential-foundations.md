# Credential Foundations

## Purpose

Separate declarative Accelerator configuration from access credentials, secret
bindings, runtime authorization and cloud execution. This mandatory knowledge
applies to every service discussion, including pre-configuration template advice.

## Accelerator Contract

Only supported native Accelerator inputs may be exported. Current output is
tfvars, not free Terraform or a second YAML schema. The matching Accelerator
can consume the configuration outside the Configurator, provided documented
external provider credentials and any required secret inputs are supplied.
Provider authentication and workload/service secret bindings are different
requirements; a STACKIT login alone does not resolve every service credential.
Do not put Configurator-only secret paths or profile IDs into native inputs.

## Dependencies

Each future service topic must describe its credential requirements explicitly.
Configuration, credential availability, permissions and execution readiness are
separate facts. A stored profile is not a proof of usable permissions. Current
authorization, tenant/owner binding and safe secret resolution must be checked
by the backend at the authorized operation, never inferred by the model.

## Dialogue

Ask about non-secret business requirements and explain the separate authorized
credential setup when needed. Never request a private key, password, API token,
VPN preshared key, kubeconfig or secret version in chat. Do not ask users for
technical IDs to work around missing configuration support. Do not invent
permission errors or assume operator credentials are available to a customer.
If a credential-binding capability is not implemented, name the limitation;
do not claim a complete executable configuration.

## Examples

User: "Configure the central network and add a firewall later."
Answer: prepare only supported network inputs and explain that provisioning
requires separate authorized STACKIT provider access. Do not request a key.

User: "Here is my VPN password; put it in the export."
Answer: do not accept or reproduce the secret. Direct the user to the authorized
binding workflow. Do not create a placeholder secret value in native configuration.

## Limits

No model-controlled credential read/write, grant, order, publish, plan, apply or
destroy. A configuration proposal requires explicit acceptance and unchanged
revision/current authorization. A reviewed receipt or valid export never unlocks
execution. Do not promise fully qualified outside-Configurator credential
portability: the complete binding/runner path remains an acceptance gate.
Documentation and examples contain no live credentials, raw state or raw plans.
Recognizable secret-input checks are not comprehensive DLP or injection proof.

## Credentials

No secrets in chat/tfvars. Native provider-created secrets and Vault data may
still be in Terraform/OpenTofu state: Secrets Manager does not remove them.
Protect state/backend access. Runtime secrets use authorized server-side storage.
No credentials, profile metadata, raw provider errors, state or plans go to Model
Serving. Standalone credentials use documented external provider/inputs, not
hidden Configurator state. Public PIM facts do not prove product availability.

## Sources

Manifest hashes bind local sources. deployment-credentials.md mixes historical
and current sections; check qualification limits. External key documentation is
not runtime-fetched. Review each service binding against actual provider/module
inputs; Assistant and identity tests are separate evidence.