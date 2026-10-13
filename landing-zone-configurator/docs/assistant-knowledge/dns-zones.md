# DNS Zones and Resolver Assignment

## Purpose

Separate authoritative DNS zones, records and SNA resolvers.

## Accelerator Contract

Zone fields: dns_name, name, description, default_ttl, type, contact_email, acl,
network_area_key (existing SNA/project). Project zones use dns_zone_name;
SNA default_nameservers sets resolvers, not zones.

## Dependencies

Existing SNA/project; Kubernetes/namespace DNS follows its own contracts.

## Dialogue

Free primary-zone suffixes:
runs.onstackit.cloud, stackit.rocks, stackit.gg, stackit.zone, stackit.run.
stackit.cloud is NOT a provided suffix. Add exactly ONE lowercase DNS label:
letters/digits/hyphens, no leading/trailing hyphen, max63 characters.
Reuse confirmed domains. Requested remaining settings: propose name (lowercase/
hyphens,max63), factual description(max1024), TTL3600s/native baseline;300s for
explicit frequent changes (range60..99999999). Explain caching/change tradeoff.
Primary is authoritative; secondary needs primaries absent from native module.
Contact: preserve an existing DNS contact; otherwise propose saved owner_email,
then the currently verified human login email as a reviewable default. Explain
its source; never invent an address. Ask only if no contact is known. ACL currently
has NO enforcement in pinned provider, never promise restricted access; retain
unless explicitly supplied. Preserve area unless explicit valid reassignment.
Availability unverified; free subdomain is NOT free DNS service.

## Examples

Example GmbH: example-gmbh.runs.onstackit.cloud; name example-gmbh-dns, TTL3600s.
dev/prod/test below it are records, not additional free-zone labels.

## Limits

Chat partial native-field patches of EXISTING central zone keys; preserve omitted
fields, no creation/regional conversion. One zone unambiguous; ask for several.
Field-selection acceptance saves, never deploys; remaining suggestions stay available.
No SNA-only zones; empty map none.
No propagation/certificate/reachability/delegation proof.

## Credentials

Separate provider/registrar access; no passwords, tokens or signing keys in chat.

## Sources

Native manifest and pinned provider0.114.0, reviewed2026-10-12.
Listed runs.onstackit.cloud controls over singular run.onstackit.cloud typo.