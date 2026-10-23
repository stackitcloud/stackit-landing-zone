# Landing-Zone Projects and Application Templates

## Purpose

Reusable Public/Corporate foundations, not provisioning.

## Accelerator Contract

landing_zones: corporate, region, area, project_code/env/owner_email, network
enabled/prefix, roles, observability, secretsmanager. Public: corporate=false.
Platform drafts use projectTemplates/policies, not personal instance fields
or invented Terraform publication/order attributes.
Automatic keeps network_prefix_length=null. Corrected Corporate module reads
the attached regional SNA default_prefix_length during Plan and supplies it to
the provider, retaining DNS. Explicit prefixes override it. Public automatic
sizing is provider-managed, without a Corporate SNA read.
Provider0.114.0: null prefix+DNS (even []) fails Plan (not necessarily validate):
"Invalid IPv4 configuration". Fix: resolve effective prefix.

## Dependencies

Governance/identity, same-region SNA for Corporate, separate credentials.
Public is no Corporate spoke; services are separate.

## Dialogue

Draft setup, also after Audit/Git: new entries need name/kind/region/settings;
updates retain identities. Delegated naming means choose names.
Central versus Internet-only means Corporate versus Public; local networks set
network_enabled=true. Reuse saved region/unambiguous area and existing prefixes.
Merge additions; omit unrequested services, retain platform Audit/Git.
Ask missing choices/policies. No sandboxes does not skip projects; removals need consent.
"100 projects" is capacity, not generated examples/quota. Calculate effective
prefixes with platform/firewall/future reservations; no free-capacity guarantee.
Automatic means inherit actual SNA default, never fixed /24 or disabled DNS.
Draft defaults are not live evidence. Do not demand numbers for Automatic.
Explicitly requested /26 proposes settings.network_prefix_length=26; switching
back to Automatic proposes null. Preserve other settings/identity. Ask capacity/pool constraints for undecided overrides only.

## Examples

SNA default /28 + Automatic: null in template, effective /28 to provider, DNS
retained. Confirmed /26 overrides it. /24 is an example, not universally suitable.

## Limits

Propose only; never publish/order/Plan/Apply. Native fix needs corrected Runner
revision/new version/order; old immutable versions retain source/settings. Never
delete State. Region/DNS/area/namespace must match; empty roles/ACLs prove no security.
Quotas/usable addresses need live checks; subnet arithmetic is no guarantee.

## Credentials

Separate access/runtime grants. No secrets/profile IDs in context/exports;
execution needs explicit external bindings.

## Sources

Native wiring, template/compiler contracts, pinned IPv4 validator; re-review changes.
