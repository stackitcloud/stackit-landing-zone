# Landing-Zone Projects and Application Templates

## Purpose

Define repeatable public or corporate project foundations with ownership,
network allocation and supported per-project services; distinguish a template
draft from provisioning actual application projects.

## Accelerator Contract

Native landing_zones is keyed project configuration. Supported settings include
corporate, region, network_area_key, project_code/env, owner_email,
network_enabled/network_prefix_length, role_assignments, custom_roles,
observability and secretsmanager_enabled. Root corporate defaults must be
respected: public intent explicitly sets corporate=false. The common document's
projectTemplates and parameter policies are compiled through the existing
native contract; publication/order workflows are not invented Terraform fields.

## Dependencies

Governance/identity, SNA in the same region for corporate projects and separate
credentials. Public projects are not automatically corporate spokes. DNS,
Secrets Manager and observability options have independent contracts.

## Dialogue

Ask about public/corporate type, teams/environments, ownership, area/region,
subnet needs and which settings application owners may choose. "100 projects"
is a capacity requirement, not permission to create 100 example entries or a
saved-template quota. Preserve stable keys/identities. A project's explicit
network_prefix_length overrides the SNA default; calculate capacity from the
effective template prefix and reserve platform/firewall/future ranges.

## Examples

Synthetic public intent must include corporate = false in its landing_zones
entry. A corporate entry with network_prefix_length = 24 uses /24 even when
the SNA default is /25. These are field fragments, not complete proposals or
automatic project creation requests.

## Limits

Current chat cannot patch complex project/template objects, publish or order.
Region, DNS/area and namespace references must match. Empty role/ACL settings
are not blanket least-privilege proof. Resource quotas and usable addresses
need live/reservation checks; theoretical subnet counts are not guarantees.

## Credentials

Provisioning, delegated application-owner credentials, secret-service workload
access and runtime grants are separate. No secrets/profile IDs in model context
or native exports; execution outside the Configurator needs explicit bindings.

## Sources

Root/landing-zone variables and common project-template/compiler/validation
sources bind the reviewed semantics. Re-review policy/identity/native export
changes before generation; full application lifecycle parity remains separate.