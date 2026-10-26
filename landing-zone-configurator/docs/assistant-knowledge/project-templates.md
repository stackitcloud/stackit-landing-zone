# Landing-Zone Projects and Application Templates

## Purpose

Templates/IAM; no execution.

## Accelerator Contract

landing_zones: corporate/region/area, project_code/env/owner_email, network/roles/
observability/secretsmanager. Public:corporate=false. Drafts: projectTemplates/policies,
not personal instance/publication fields.
accessProfile: granular workload/explicit owner, separate central initial owner and automation.
Automatic: null prefix; Corporate inherits SNA regional default during Plan
with DNS; explicit overrides win. Public uses provider sizing.
Provider0.114: null prefix+DNS (even []) fails Plan: Invalid IPv4 configuration.

## Dependencies

Governance, verified identity, same-region SNA for Corporate, separate credentials.
Public is not a Corporate spoke. Namespace services require Platform Kubernetes.

## Dialogue

New: name/kind/region/settings; reuse known keys. Delegate names only.
Central=Corporate; Internet-only=Public; local network=true. Merge, retain Audit/Git;
omit unrequested services. Ask missing choices.
"100 projects" means capacity, not examples/quota; reserve platform/firewall space.
No free-capacity promise. Explicit /26: network_prefix_length=26; Automatic=null,
no mandatory /24/numeric choice or disabled DNS. Preserve other settings.
Recommend NEW-template granular workload rights; full owner remains customer choice.
IDP verifies identity; Configurator roles and deployed project IAM are separate.
accessProfile is immutable template metadata, never an order input. Granular:
schemaVersion=1, mode=granular, accessProfile.initialOwnerEmail (user/SA,
not requester), explicit permissions/automationPermissions: iaas.server.get, never compute.*.
Exclude IAM/project deletion/central routing/SA management/Floating-IP attachment;
VM, Object Storage, Observability, Secrets Manager; VM-only preset is narrower.
Owner policy exactly {schemaVersion:1,mode:owner}: requester/automation get owner.
Explain IAM/project-control powers; no immutable central audit/routing claim.
Propose COMPLETE atomic profile; preserve unrequested fields. No combination with
legacy custom_roles/role_assignments/automation_role or role-context policy.
New: granular; ask missing central owner.
Absent profile preserves legacy owner. Inherited grants are additive, not cancelled.

## Examples

SNA /28: Automatic=/28, DNS kept.

## Limits

Old versions/State stay bound; changes need reviewed source/publication/migration.
Never delete State. Region/area/DNS must match. Empty roles/ACLs prove no security.
Effective rights/workloads need live acceptance, not grants/mock Plans. Not owner-less.

## Credentials

Separate user access/runtime grants. No secrets/profile IDs in chat/exports.

## Sources

Native/IAM.
