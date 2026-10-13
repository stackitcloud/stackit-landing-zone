# Organization and Naming Foundations

## Purpose

Organization, ownership, naming and region precede platform services.
A company name is not an organization ID or access proof.

## Accelerator Contract

Roots: organization_id, owner_email, company_name, company_code, region, labels,
platform_contract_namespace. Namespace is stable handoff metadata, not authorization.
Names derive from company_code, project codes and environments, not company_name.
Provider regions must match root/module wiring.

## Dependencies

Governance uses organization/ownership; regional services and projects use naming.
Credentials remain separate; dependencies never activate services.

## Dialogue

Use supplied company names verbatim. Explicit suitable-name delegation permits
reviewable names/codes, not region, guessed emails, Cloud IDs or access.
Propose organization_id only from the exact user-supplied existing UUID:
no access verification or tenant binding. owner_email may reuse user requirements,
saved foundations or currently verified human login email; never invent it.
Template placeholders are not user decisions. Resolve access outside chat.
Preserve company/region during SNA-only work; flag remaining placeholders separately.

## Examples

Synthetic naming fragment: company_name = "Example GmbH", company_code = "ex",
region = "eu01", labels = { environment = "lab" }. This is not a complete
deployable configuration or a grant to create resources.

## Limits

Labels prove neither resource names nor membership. Naming/region changes may
replace resources; saved values are not cloud inventory. Preserve imports and
stable identities. Compilation proves neither permissions nor deployment.

## Credentials

Use externally supplied provider credentials and authorized organization scope.
Never request service-account keys, tokens or internal credential-profile paths.

## Sources

Manifest binds variables/providers/feature model to the engine revision.
Re-review naming, region and handoff before regeneration; local draft only.