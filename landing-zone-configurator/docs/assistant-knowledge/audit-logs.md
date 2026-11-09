# Audit Routing and Archive Retention

## Purpose

Audit routing.

## Accelerator Contract

audit_logs=null skips routing/retention, not archive bucket.
Sinks: S3 + ONE query store. With observability: OTLP to its built-in Grafana Audit Logs Dashboard.
Technical credential for data; users log in with SSO; no admin; no separate Logs instance/tokens/destination.
Without Observability: Logs. Needs logs-capable plan, not
Monitoring/Frontend/MetricsEndpoint. Observability has own retention/cost;
retention_days controls S3 and, only in fallback, Logs.
Dev Plan/Apply removes dedicated Logs/history/tokens/target; adds Observability
target/credential. S3/Router/links/projects stay. No order upgrade for linked
projects, no historical replay. Dashboard: 24h/all filters; may lag. UUIDs are metadata. acl controls Logs clients, observability.acl Observability.
Router ranges join the selected store's ACL, preserving clients.
router_egress_cidrs=null uses public STACKIT feed (not Router-only); nonempty IPv4
list narrows. Authentication required; empty feed fails.
Object Lock defaults true, including nested null; retention 180. Explicit false
opts out before creation. With lock: 1..365 days, GOVERNANCE; not reversible
or compliance certification.
Organization links capture ONLY organization events, no inheritance.
managed_resources=false by default; true links managed folders/projects and new
orders via platform contract. Existing unlinked orders need approved platform
upgrade + fresh Plan/Apply. No explicit link_scopes with managed coverage.
Managed scopes same-region; others need reviewed routers. link_scopes supports
organization/folder/project. External links need reviewed import.

## Dependencies

Central identity, same-region router/link. Default workload identities cannot
read central ingestion secrets.

## Dialogue

Ask retention/ACL/Lock/coverage; preserve choices, defaults are not consent.
Editor creation needs explicit retention/ACL/Lock. Managed coverage uses
managed_resources=true, no invented IDs.

## Examples

Draft: audit_logs={retention_days=90,s3_object_lock=false}.

## Limits

Future events only. Default rights exclude audit mutation; Owner/inherited grants
can alter routing: no deny guarantee. Verify query/S3/dashboard delivery/access.
Recovery preserves links; lost secrets need exact approved revocation + fresh
Plan/Apply, never fabricated keys.

## Credentials

No tokens, S3 keys, State or audit contents in chat/public contracts.
Protected execution only.

## Sources

Manifest binds sources; configuration proves no delivery/compliance.
