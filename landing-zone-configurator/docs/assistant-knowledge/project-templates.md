# Landing-Zone Projects and Application Templates

## Purpose

Projects.

## Accelerator Contract

landing_zones:corporate/region/area,project_code/env/owner_email,network/roles/services.
Public:corporate=false; drafts:projectTemplates/policies.
Automatic=null:Corporate resolves regional SNA default_prefix_length before Plan; numeric to Provider0.114; preserve DNS.
Provider0.114: null prefix+DNS(even []) invalid; native resolves, overrides win; Public provider sizing.

## Dependencies

Verified identity/governance; regional SNA. Public!=Corporate; Platform K8s namespaces.

## Dialogue

New:name/kind/region/settings; reuse keys.
Central=Corporate; Internet-only=Public; local network=true. Keep settings. Project count!=examples/quota; reserve Platform space.
/26:network_prefix_length=26; Automatic=null, never mandatory /24 or disabled DNS.
New:granular; Owner optional.
IDP!=Configurator roles!=project IAM.
Immutable accessProfile!=order input: schemaVersion=1,mode=granular;
initialOwnerEmail=user/SA!=requester; permissions/automationPermissions=official IDs.
Preset counts/services: runtime facts; VM narrower. Keys: iam.service-account.{get,list},
iam.service-account-key.{create,delete,edit,get,list}. Project-wide keys use ALL SA rights, even elsewhere; privileged Platform SAs outside. No SA create/delete/role/member admin.
ADD keys=seven incl.account lookup(get/list), requester default; preserve owner/SKE/automation. Exact permission IDs override bundles.
Defaults: server-backup/server-update/run-command (schedules/restore/OS updates/commands), IaaS backups/snapshots writes. Install agent separately; old profiles unchanged; new version+upgrade.
SKE/Git/databases/IAM-admin: optional, NOT preset defaults.
ADD SKE=catalogue ske union (both unless specified). Preserve rights. Public+Corporate=both; clarify duplicates.
SKE IAM!=K8s RBAC; no default IAM role/member admin.
Owner={schemaVersion:1,mode:owner}: all project rights for both, incl.IAM/project; no immutable audit/routing claim.
Atomic; no legacy roles.
Public+Corporate: ONE common missing owner; preserve explicit owners.
"Platform service account"=prepared config/org email; ambiguity asks.
Workload+services recommended. Legacy: confirm removed roles/context/native Owner defaults.
Publish needs owner; grants add; no execution.


Project Git: settings.git={enabled,flavor,acl}; disabled; one instance/project.
Policy: fixed/bounded input git.enabled/git.flavor/git.acl. Explicit nonempty source CIDRs.
Public endpoint, never SNA/firewall-private. Public source ACLs; Git-capable Runner; old orders unchanged.
git-10<=10, git-100<=100 users/instance; >100: separate instances.
No larger flavor/federation. Partition users by project/team; endpoints stay public. Provider0.114 flavor/ACL changes replace.

## Examples

/28:null.

## Limits

Version/State bound; review migrations; never delete State. Match region/area/DNS. Empty roles/ACLs!=security; live acceptance.

## Credentials

Separate grants; no secrets/profile IDs.

## Sources

IaC.
