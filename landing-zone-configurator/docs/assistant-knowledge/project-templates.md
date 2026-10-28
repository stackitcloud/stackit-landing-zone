# Landing-Zone Projects and Application Templates

## Purpose

Templates/IAM.

## Accelerator Contract

landing_zones: corporate/region/area, project_code/env/owner_email, network/roles/services.
Public:corporate=false. Drafts: projectTemplates/policies, no instance/publication fields.
accessProfile: granular/owner; separate central initial owner/automation.
Automatic=null. Corporate Accelerator reads attached regional SNA default_prefix_length
before Plan; supplies explicit numeric prefix to Provider0.114, preserves DNS.
Provider0.114 rejects null prefix WITH DNS (even []): Invalid IPv4 configuration.
Accelerator resolves it; no provider-upgrade fix. Explicit overrides win; Public provider sizing.

## Dependencies

Governance, verified identity, same-region Corporate SNA, separate credentials.
Public!=Corporate spoke. Namespace services require Platform Kubernetes.

## Dialogue

New: name/kind/region/settings; reuse keys; delegate names only.
Central=Corporate; Internet-only=Public; local network=true. Merge, retain Audit/Git,
Omit unrequested services; ask missing choices. "100 projects"=capacity, not examples/quota;
Reserve platform/firewall space; no free-capacity promise. /26: network_prefix_length=26;
Automatic=null; no mandatory /24/numeric choice/disabled DNS. Preserve other settings.
New: granular recommended; owner customer choice.
IDP, Configurator roles and deployed project IAM are separate.
Immutable accessProfile, never order input. Granular schemaVersion=1,mode=granular:
initialOwnerEmail=user/SA, not requester; permissions/automationPermissions: official IDs,
e.g. iaas.server.get; no compute.*. Default144: VM,Object Storage,Observability,Secrets Manager;
VM-only narrower. All project rights selectable, including IAM/admin.
Catalogue IDs only. ADD Kubernetes/SKE=ske union into requested lists
(default both), preserving owner/rights; no unrelated IAM. SKE IAM!=Kubernetes RBAC.
IAM grants can escalate; excluded from defaults.
Owner={schemaVersion:1,mode:owner}: requester/automation have all project rights;
IAM/project powers; no immutable central audit/routing claim.
Atomic profile; preserve other fields. No legacy custom_roles/role_assignments/
automation_role/role-context combination. ADD preserves even empty owner; no owner question.
Publication needs valid owner; new profile asks missing owner. Absent profile preserves
legacy owner; inherited grants stay additive.

## Examples

SNA /28: Automatic /28+DNS.

## Limits

Versions/State bound; review source/publication/migration. Never delete State.
Match region/area/DNS. Empty roles/ACLs prove no security. Rights need live acceptance, not mock Plans. Owner required.

## Credentials

Separate access/runtime grants; no secrets/profile IDs in chat/exports.

## Sources

IaC.
