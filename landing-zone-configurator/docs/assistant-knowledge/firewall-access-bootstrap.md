# Firewall Access and Bootstrap Phases

## Purpose

Prepare appliance access without secrets in conversations or exports.

## Accelerator Contract

Native roots: firewall_admin_username, firewall_admin_password,
firewall_api_credentials, firewall_bootstrap, firewall_api_secret_version,
firewall_bootstrap_username and firewall_bootstrap_password.
New native VMs initialize the configured admin before API/HA setup when
firewall_admin_password is non-null; null skips preconfigured images. Separate
bootstrap credentials authenticate the image account. Verify a custom admin before
giving the retained image account the same password. Upgrades/variable changes
never reset existing VMs. Packaged Hosted Runners require a new native source pin.
firewall_bootstrap is a separate boolean API-key phase for single
connectivity.firewall, with local credentials and later management Vault use.
File/provider paths are native execution details. Policy follows actual predicates.

## Dependencies

Require a supported firewall, management secrets and provider/appliance access;
HA covers both nodes. Credential foundations remain mandatory.

## Dialogue

Clarify creation/bootstrap/policy, authorized Runner reachability and credential
ownership. Use secure bindings; never request password/API values or internal
secret-version IDs. Image defaults do not authorize initialization.

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

Root variables, creation provisioners, bootstrap logic and providers define scope;
review secret precedence before regeneration. This text is not certification.
