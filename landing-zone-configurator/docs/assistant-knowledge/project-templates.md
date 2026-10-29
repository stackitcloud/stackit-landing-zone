# Landing-Zone Projects and Application Templates

## Purpose

Templates/IAM.

## Accelerator Contract

landing_zones: corporate/region/area, project_code/env/owner_email, network/roles/services.
Public:corporate=false. Drafts: projectTemplates/policies, no instance/publication fields.
accessProfile: granular/owner; central owner/automation.
Automatic=null. Corporate Accelerator reads attached regional SNA default_prefix_length
before Plan; numeric prefix to Provider0.114, preserves DNS.
Provider0.114 rejects null prefix WITH DNS (even []): Invalid IPv4 configuration.
Accelerator resolves it; not provider upgrade. Overrides win; Public provider sizing.

## Dependencies

Verified identity/governance, same-region Corporate SNA, separate credentials.
Public!=Corporate spoke. Namespace services require Platform Kubernetes.

## Dialogue

New:name/kind/region/settings; reuse keys; delegate names only.
Central=Corporate; Internet-only=Public; local network=true. Preserve Audit/Git and
unrequested settings. "100 projects"=capacity, not examples/quota; reserve platform space.
/26:network_prefix_length=26; Automatic=null, never mandatory /24 or disabled DNS.
New: granular; Owner optional.
IDP, Configurator roles and deployed project IAM are separate.
Immutable accessProfile, not order input. Granular schemaVersion=1,mode=granular:
initialOwnerEmail=user/SA, not requester; permissions/automationPermissions: official IDs,
e.g. iaas.server.get; no compute.*. Default144: VM,Object Storage,Observability,Secrets Manager;
VM-only narrower. All project rights selectable, including IAM/admin.
Catalogue IDs only. ADD SKE=ske union into requested lists (default both);
preserve owner/rights. Public AND Corporate=both; clarify duplicates.
SKE IAM!=Kubernetes RBAC; IAM escalation excluded from defaults.
Owner={schemaVersion:1,mode:owner}: requester/automation have all project rights;
IAM/project powers; no immutable central audit/routing claim.
Atomic profile; no legacy role combination. ADD preserves existing owners/rights.
For Public+Corporate ask ONE common missing owner; explicit owners remain.
"Platform service account" resolves only prepared config/org-bound email; ambiguity asks.
Recommend workload+requested service rights. Legacy conversion requires explicit confirmation
of removed role settings/context and native Owner defaults; never silently downgrade.
Publication needs owner; grants additive. Nothing saved/executed.

## Examples

SNA /28: Automatic /28+DNS.

## Limits

Versions/State bound; review migrations; never delete State.
Match region/area/DNS. Empty roles/ACLs prove no security. Rights need live acceptance, not mocks. Owner required.

## Credentials

Separate runtime grants; no secrets/profile IDs in chat/exports.

## Sources

IaC.
