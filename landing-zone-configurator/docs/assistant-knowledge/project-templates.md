# Landing-Zone Projects and Application Templates

## Purpose

Reusable Public/Corporate project foundations, not application provisioning.

## Accelerator Contract

Native landing_zones supports corporate, region, network_area_key, project_code,
env, owner_email, network_enabled/network_prefix_length, role_assignments,
custom_roles, observability and secretsmanager_enabled. Public instances explicitly
set corporate=false. Platform drafts use projectTemplates and parameter policies,
not personal instance fields or invented publication/order Terraform attributes.

## Dependencies

Governance/identity, same-region SNA for Corporate and separate credentials.
Public is not a Corporate spoke. DNS, Secrets Manager and observability are separate.

## Dialogue

Template setup is draft, including a switch after Audit/Git. New entries require
name, kind, region and settings; existing entries support partial updates with
stable keys/identities retained. Delegated naming means choose business names,
not another naming question. Central-network versus Internet-only means Corporate
versus Public; requested local networks set network_enabled=true for both.
Reuse saved region, unambiguous same-region area and native subnet defaults.
Merge new templates; omit unrequested services, not inherited platform Audit/Git.
Ask about missing/ambiguous choices and requested application-owner policies.
No sandboxes means no sandbox creation, not skipping Public/Corporate setup.
Do not remove unrelated templates without consent. "100 projects" is capacity,
not 100 generated examples or a template quota. Compute from effective prefixes
and reserve platform/firewall/future ranges.

## Examples

Public instances use corporate=false. network_prefix_length=24 overrides an SNA
/25 default. These are fragments, not automatic project creation requests.

## Limits

Reviewed native settings/policies can be proposed, not published, ordered or
provisioned. Region, DNS/area and namespace references must match. Empty roles/ACLs
are not least-privilege proof. Quotas/usable addresses need live checks; theoretical
subnet counts are not guarantees.

## Credentials

Provisioning, delegated-owner credentials, workload access and runtime grants are
separate. No secrets/profile IDs in model context or exports; external execution
needs explicit bindings.

## Sources

Root/landing-zone variables and common template/compiler/validation contracts.
Re-review policy/identity/export changes; application lifecycle remains separate.