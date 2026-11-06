# Landing-Zone Projects and Application Templates

## Purpose

Templates/IAM.

## Accelerator Contract

landing_zones:corporate/region/area,project_code/env/owner_email,network/roles/services.
Public:corporate=false; drafts:projectTemplates/policies.
Automatic=null:Corporate resolves regional SNA default_prefix_length before Plan; numeric to Provider0.114; preserve DNS.
Provider0.114: null prefix+DNS(even []) invalid; native resolves, overrides win; Public provider sizing.

## Dependencies

Verified identity/governance; regional SNA; separate credentials. Public!=Corporate; namespaces:Platform K8s.

## Dialogue

New:name/kind/region/settings; reuse keys.
Central=Corporate; Internet-only=Public; local network=true. Preserve settings. "100 projects"=capacity!=examples/quota; reserve Platform space.
/26:network_prefix_length=26; Automatic=null, never mandatory /24 or disabled DNS.
New:granular; Owner optional.
IDP!=Configurator roles!=project IAM.
Immutable accessProfile!=order input: schemaVersion=1,mode=granular;
initialOwnerEmail=user/SA!=requester; permissions/automationPermissions=official IDs. Default191=184+7 keys; automation184.
VM-only narrower +keys. Keys: iam.service-account.{get,list},
iam.service-account-key.{create,delete,edit,get,list}. Keys use ALL SA rights, also elsewhere; privileged Platform SAs outside. No SA create/delete/role/member admin.
ADD keys=seven, requester default; preserve owner/SKE/automation.
Defaults: server-backup/server-update/run-command (schedules/restore/OS updates/commands), IaaS backups/snapshots writes. Install agent separately; old profiles unchanged; new version+upgrade.
All project rights incl.IAM selectable.
ADD SKE=catalogue ske union (both unless specified). Preserve rights. Public+Corporate=both; clarify duplicates.
SKE IAM!=K8s RBAC; no default IAM role/member admin.
Owner={schemaVersion:1,mode:owner}: all project rights for both, incl.IAM/project; no immutable audit/routing claim.
Atomic; no legacy roles.
Public+Corporate: ONE common missing owner; preserve explicit owners.
"Platform service account"=prepared config/org email; ambiguity asks.
Workload+services recommended. Legacy: confirm removed roles/context/native Owner defaults.
Publication needs owner; additive grants; nothing saved/executed.

## Examples

/28:Automatic+DNS.

## Limits

Version/State bound; review migrations; never delete State. Match region/area/DNS. Empty roles/ACLs!=security; live acceptance.

## Credentials

Separate grants; no secrets/profile IDs.

## Sources

IaC.
