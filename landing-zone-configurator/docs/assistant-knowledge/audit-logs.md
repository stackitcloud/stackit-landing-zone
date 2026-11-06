# Audit Routing and Archive Retention

## Purpose

Audit routing.

## Accelerator Contract

audit_logs=null skips routing/retention, not archive bucket.
Fields: retention_days, acl, s3_object_lock, managed_resources, link_scopes, router_egress_cidrs.
Sinks: Logs/OTLP + S3. With central observability: extra OTLP route feeds built-in
Grafana Audit Logs Dashboard via technical credential, no Grafana admin.
Needs Logs plan; not Monitoring/Frontend/MetricsEndpoint. Observability
stores another copy with own retention/cost; retention_days controls Logs/S3.
Upgrade: reviewed platform Plan/Apply adds route/ACL, no order upgrade for linked
projects or historical replay. Dashboard: 24h/all filters; delivery may lag.
UUIDs are structured metadata.
Router ranges join Logs/Observability ACLs; keep clients.
router_egress_cidrs=null uses public STACKIT feed (not Router-only); nonempty IPv4
list narrows. Authentication required; empty feed fails.
Object Lock defaults true, including nested null; retention 180. Explicit false
opts out before creation. With lock: 1..365 days, GOVERNANCE; not reversible
or compliance certification.
Organization links capture ONLY organization events, no inheritance.
managed_resources=false by default; true links managed folders/projects and new
Application orders via platform contract. Existing unlinked orders need approved
platform upgrade + fresh Plan/Apply. No explicit link_scopes with managed coverage.
Same-region managed scopes; others need reviewed routers. Custom scopes:
organization/folder/project. External links need reviewed import, no takeover.

## Dependencies

Management identity; same-region router/link. Audit ≠ Observability.
Ingestion secrets stay central, inaccessible to default workload identities.

## Dialogue

Ask retention/ACL/Lock/coverage; preserve choices. Defaults are not consent.
Editor creation requires explicit retention/ACL/Lock decisions.
Managed coverage: managed_resources=true; no invented IDs.

## Examples

Draft: audit_logs={retention_days=90,s3_object_lock=false}.

## Limits

Future events only. Default workload rights exclude audit mutation; Owner/inherited
grants can alter routing: no deny guarantee. Verify Logs/S3/dashboard delivery and
access separately. Recovery preserves links; lost secrets require exact approved
revocation + fresh Plan/Apply, never fabricated keys.

## Credentials

No tokens, S3 keys, State or audit contents in chat/public contracts. Secrets stay
in protected execution/State.

## Sources

Manifest binds sources; configuration proves no delivery/compliance.
