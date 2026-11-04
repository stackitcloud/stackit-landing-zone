# Landing-Zone Projects and Application Templates

## Purpose

Templates/IAM.

## Accelerator Contract

landing_zones: corporate/region/area,project_code/env/owner_email,network/roles/services.
Public:corporate=false; drafts:projectTemplates/policies only.
Automatic=null: Corporate reads regional SNA default_prefix_length before Plan;
numeric to Provider0.114, DNS preserved.
Provider0.114: null prefix+DNS(even [])=>Invalid IPv4 configuration.
Resolved natively; overrides win; Public provider sizing.

## Dependencies

Verified identity/governance; regional Corporate SNA; separate credentials.
Public!=Corporate. Namespaces:Platform Kubernetes only.

## Dialogue

New:name/kind/region/settings; reuse keys.
Central=Corporate; Internet-only=Public; local network=true. Preserve other settings. "100 projects"=capacity, not examples/quota; reserve platform space.
/26:network_prefix_length=26; Automatic=null, never mandatory /24 or disabled DNS.
New:granular; Owner optional.
IDP!=Configurator roles!=project IAM.
Immutable accessProfile, not order input; schemaVersion=1,mode=granular:
initialOwnerEmail=user/SA, not requester; permissions/automationPermissions: official IDs,
e.g. iaas.server.get. Workload requester151=base144+7 key rights; automation144.
VM-only narrower +requester keys. Keys: iam.service-account.{get,list},
iam.service-account-key.{create,delete,edit,get,list}. Project-wide keys use ALL SA rights,
also elsewhere; privileged Platform SAs stay outside. No SA create/delete/role/member admin.
ADD keys=only seven, default requester; preserve owner/SKE/automation. Old profiles unchanged.
All project rights selectable incl.IAM/admin.
Catalogue only. ADD SKE=ske union into requested lists(default both);
Preserve rights. Public+Corporate=both; clarify duplicates.
SKE IAM!=Kubernetes RBAC; IAM role/member administration excluded from defaults.
Owner={schemaVersion:1,mode:owner}: requester/automation have all project rights;
IAM/project powers; no immutable central audit/routing claim.
Atomic; no legacy roles. ADD preserves owners/rights.
Public+Corporate: ONE common missing owner; preserve explicit owners.
"Platform service account"=prepared config/org email only; ambiguity asks.
Recommend workload+service rights. Legacy conversion requires confirmation
of removed role settings/context and native Owner defaults.
Publication needs owner; grants additive. Nothing saved/executed.

## Examples

/28:Automatic+DNS.

## Limits

Versions/State bound; review migrations; never delete State.
Match region/area/DNS. Empty roles/ACLs prove no security; live acceptance required.

## Credentials

Separate grants; no secrets/profile IDs in chat/exports.

## Sources

IaC.
