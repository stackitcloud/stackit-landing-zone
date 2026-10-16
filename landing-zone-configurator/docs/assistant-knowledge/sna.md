# STACKIT Network Areas (SNA)

## Purpose

SNA is the STACKIT Network Area for central project networking, not AWS VPC,
Shared VPC or Direct Connect. Separate it from firewall, VPN and external sites.

## Accelerator Contract

Native single form: connectivity.network_area; map: connectivity.network_areas
with stable keys; regional form: connectivity_regions. Never mix forms.
Area fields: ranges, transfer_network (IPv4 CIDRs), min_prefix_length,
max_prefix_length, default_prefix_length, optional name/default_nameservers.
Prefix order: min <= default <= max, integers within 0..32. Backend patch schema
and shared compiler decide editable capabilities, not knowledge text.

## Dependencies

Credential/governance foundations apply. Corporate projects need an area in
the same region; omitted corporate retains the Corporate default. Preserve
referenced area keys. Project count is no quota guarantee. OPNsense is the
supported central firewall, not Palo Alto/Fortinet/AWS Network Firewall; an SNA
never implies enabling it.

## Dialogue

Reuse context/answers; ask at most three missing questions: unused pool, project
subnet size and free transfer subnet. Explain CIDRs and required communication,
not invented isolation switches. /16 contains 256 /24s before reservations:
arithmetic, not quota. /16 contains 512 /25s; /25 has128 addresses, not128
project subnets. Infrastructure reservations reduce usable capacity.
Any suggested pool is an assumption until confirmed free.
Once inputs are known propose an SNA patch, not another questionnaire. Do not
repeat unchanged company/owner/region or ask about firewall/VPN/secret versions
when those are later steps. Inherited firewall/DNS values are not consent:
warn about conflicting pools or enabled services without silently changing
them. Explicit combined SNA/firewall requests retain firewall/HA requirements:
reuse a complete saved SNA and continue the firewall contract, not an artificial
SNA-first restriction. Missing SNA inputs remain actual dependencies.
Project-specific prefixes override SNA defaults.

## Examples

Synthetic confirmed pool10.64.0.0/16, transfer10.63.0.0/24, fixed /24,
eu01/key default, firewall later. network_areas.default holds these fields;
retain network_area in existing single drafts. No implicit firewall/routes.
Export native tfvars, not free Terraform.

## Limits

The specialized SNA dialogue supports single/map add/edit. Other reviewed public
settings use typed native Editor proposals, never implicit migrations or
execution. Firewall uses its separate reviewed central
infrastructure/HA patch contract, not an implicit part of SNA. Preserve unknown imports outside model
context. Validate before presentation/acceptance; only explicit authorized
acceptance saves. Never claim deployed. Full overlap, quota, availability and
firewall-containment checks remain separate; clean compilation is not proof.
Only reviewed Editor paths may change; protected inputs remain excluded.

## Credentials

External provider credentials/current permissions are required for provisioning,
not for mere draft advice. No keys, passwords, IDs, state, plans or profiles in
model context; do not invent missing-permission errors.

## Sources

Manifest hashes bind local connectivity/validation sources. External provider
links are informational, not live/latest behavior. Re-review contract changes;
Assistant, Common-Configuration and identity tests remain separate evidence.