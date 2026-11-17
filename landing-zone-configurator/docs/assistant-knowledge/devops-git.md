# DevOps Git Service

## Purpose

Central managed Git, separate from GitHub login, forks and Configurator CI.

## Accelerator Contract

Root derives project, ownership and naming; passes git_flavor and
allowed_network_ranges. devops=null skips deployment. git_flavor defaults to
null, NOT git-10/git-100: null or an ACL-only object creates no Git instance.
Live catalogues are needed for real sizes and regional availability.

## Dependencies

Management/governance, identity foundations, provider rights and deliberate ACLs.
A fork proves neither provisioned Git nor service-account rights.

## Dialogue

Broad setup requests ("Please add a central git instance to the config") start
a dialogue. Ask missing size/capacity and access decisions, preserving user
answers across turns. Only propose a complete new component. There is no enabled
flavor default: ask instead of inventing git-10. A verified catalogue can ground
a labelled recommendation, never entitlement or availability. Ask actual CIDRs
as free text, without invented examples or preset networks. A blank answer never
means consent to allow all. Separate operator, runners and integrations; do not
infer migrations or secrets.

## Examples

devops=null opts out. Selected git_flavor plus deliberate allowed_network_ranges
can propose Git. git-10 illustrates syntax, not entitlement or capacity.

## Limits

Editor acceptance changes only the local draft. ACLs do not qualify backup/restore,
migration, SSO or CI execution. No arbitrary Git appliances, prices, performance
or availability promises. Root wiring, not child parameters, defines support.

## Credentials

Provisioning and Git-user access are separate. No PATs, SSH private keys, Git
passwords or CI secrets in chat; no hidden Configurator profile-ID dependency.

## Sources

Root calls, DevOps variables and provider configuration in the manifest.
Refresh source bindings after review; live product facts stay separate.
