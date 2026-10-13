# DevOps Git Service

## Purpose

Provide an explicitly requested managed Git service for platform development,
separate from GitHub login, repository forks or Configurator deployment workflows.

## Accelerator Contract

Native devops is optional; null skips the module. Root wiring derives its
platform project, ownership and naming and passes git_flavor and
allowed_network_ranges. A child-module parameter is not a root feature unless
the root passes it. No arbitrary CI service or free Terraform Git appliance is
introduced by this topic. Flavor syntax follows the contract; real selectable
sizes and regional availability come from authorized catalogues.

## Dependencies

Management/governance and identity foundations, provider rights and chosen
network ACLs. A GitHub repository fork does not prove a provisioned STACKIT Git
service or service-account authorization.

## Dialogue

Ask whether managed Git is needed, capacity, operating ownership and access
networks. Reuse verified live flavor labels. Do not interpret an allow-all
default or a template value as explicit public access approval. Do not infer
CI/CD runners, integrations, migration or secrets from a Git-service request.

## Examples

Synthetic opt-out: devops = null. Enabling the native object requires a verified
git_flavor and deliberate allowed_network_ranges. A label such as git-10 is
illustrative syntax, not a claim of current entitlement or capacity.

## Limits

Current chat cannot patch the complex devops object. ACL configuration is not
backup/restore, repository migration, SSO or CI execution qualification. Do not
promise stock prices/performance or arbitrary regional support.

## Credentials

Provisioning credentials and Git workload/user access are separate. Never
request PATs, SSH private keys, Git passwords or CI environment secrets. Native
execution bindings must not depend on hidden Configurator profile IDs.

## Sources

Root calls, DevOps variables and provider configuration are local manifest
sources. Review changes before generation; product selections remain separately
authorized live facts, not static copies in this topic.