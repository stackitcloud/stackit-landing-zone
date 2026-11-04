# Audit Routing and Archive Retention

## Purpose

Control-plane audit events with chosen scope, access and retention.

## Accelerator Contract

audit_logs=null skips routing/retention, not the archive bucket.
Sinks: Logs/OTLP and S3. Fields: retention_days, acl,
s3_object_lock, managed_resources, link_scopes (resource_type/resource_id).
Object Lock defaults true, including nested null; retention 180.
Explicit false opts out before creation. With lock: 1..365 days,
GOVERNANCE mode, not a reversible switch or compliance certification.

Organization links capture organization events ONLY, no folder/project
inheritance. managed_resources defaults false; true adds all managed folders/
projects and new Application orders via the platform contract. Existing orders
need an approved platform upgrade and fresh Plan/Apply. No explicit link_scopes.
Managed resources must share the platform region; other regions need reviewed
routers. Custom scopes support organization/folder/project;
existing external links need reviewed import, never silent takeover.

## Dependencies

Management, central deployment identity, same-region router/link. Audit differs
from Observability. Application ingestion tokens stay in the central project,
inaccessible to default workload identities.

## Dialogue

Ask retention, ACL, Object Lock and organization-only/managed coverage. Preserve
saved choices; defaults are not consent.
Requested managed coverage uses managed_resources=true with reviewed settings,
not invented IDs or link_scopes.

## Examples

Synthetic draft: audit_logs={ retention_days=90, acl=["203.0.113.0/24"],
s3_object_lock=false, managed_resources=true }.

## Limits

Editor creation requires explicit retention, ACL and Object Lock decisions.
Links capture future events, not retroactive history. Defaults exclude audit
mutation rights; effective Owner/inherited grants can still change routing.
No deny guarantee. Verify Logs/S3 delivery and access separately. Recovery
preserves link identities;
a lost ingestion secret requires exact approved revocation and a fresh Plan/Apply
for replacement, never fabricated secret material.

## Credentials

No router/OTLP tokens, S3 keys, State or audit contents in chat/public contracts.
Secrets stay in protected execution and State storage.

## Sources

Manifest binds native and recovery contracts. Re-review before generation;
configuration proves no delivery/compliance.
