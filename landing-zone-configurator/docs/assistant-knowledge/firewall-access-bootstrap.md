# Firewall Access and Bootstrap Phases

## Purpose

Prepare secure appliance access for supported bootstrap and policy operations
without embedding secrets in conversations, configuration documents or exports.

## Accelerator Contract

Native roots: firewall_admin_username, firewall_admin_password,
firewall_api_credentials, firewall_bootstrap and firewall_api_secret_version.
Bootstrap is a boolean phase control, not an invented object. Current root
bootstrap handles the single connectivity.firewall path, can create local API
credentials and use management Secrets Manager/Vault in later phases. Existing
file/secret/provider paths are native execution concerns, not instructions for
the model to read them. Policy activation follows the actual bootstrap predicates.

## Dependencies

An explicitly required supported firewall, management secret storage, provider
and appliance connectivity. HA access requirements cover primary and backup.
Credential foundations stay mandatory even when discussing only infrastructure.

## Dialogue

Ask whether this is infrastructure creation, bootstrap or policy maintenance,
which authorized runner can reach the appliance and who owns credentials.
Direct users to secure binding controls. Never ask for password/API values or
internal secret-version IDs. Defaults in an image/schema are not a safe access
decision or approval to initialize an appliance.

## Examples

Synthetic native phase fragment: firewall_bootstrap = false. It is not alone a
complete policy prerequisite; external credentials, secret availability and
the enabled firewall_config contract must be checked independently.

## Limits

Do not claim generic regional/multi-appliance bootstrap parity, automatic
credential rotation or fully qualified execution outside the Configurator.
Current chat cannot alter secrets, bootstrap access or execution grants.
Local credential-file creation is a sensitive execution side effect; it must
not be triggered merely by selecting a template or accepting an SNA proposal.

## Credentials

Passwords/API keys stay in secure external bindings; never echo defaults from
source code. Secret-version metadata is not a value to infer. No token rotation,
credential-file reads, raw state or plan transfer to model context.

## Sources

Root variables, bootstrap logic, providers and deployment credentials document
the native phase boundary. Re-review precedence, write-only/ephemeral secrets
and scope before regeneration; this text does not certify safe bootstrap runs.