# Audit Routing and Archive Retention

## Purpose

Audit routing.

## Accelerator Contract

audit_logs=null removes routing/retention/archive; no replacement.
Default/State buckets remain. Object retention can block deletion.
S3 + ONE query store; Observability OTLP feeds its built-in Grafana Audit Logs Dashboard.
Only with Observability: users log in to Grafana via SSO; no admin needed.
Machine credentials != SSO; no fallback Logs/tokens.
Without Observability: separate Logs instance, read/write API tokens and query URL
in Secrets Manager. Query via API/configured Grafana datasource, not a promised
SSO Logs console. observability.plan_name needs Logs support, not
Monitoring/Frontend/MetricsEndpoint. No plan_name in audit_logs. Observability has own retention/cost;
retention_days: S3 + fallback Logs.
Plan/Apply removes dedicated Logs/history/tokens/target; adds Observability target/credential. S3/Router/links/projects stay. No order upgrade for linked
projects, no historical replay. Dashboard: 24h/all filters; may lag; UUIDs are metadata. acl controls Logs clients, observability.acl Observability.
Router ranges join store ACL, preserving clients.
router_egress_cidrs=null: STACKIT feed (not Router-only).
IPv4 CIDRs narrow sink ACL only, not Router egress; []/empty feed fail; auth required.
Lock: true (also nested null), 180 days; explicit false before creation;
GOVERNANCE 1..365; no in-place unlock or compliance claim.
Organization links capture ONLY organization events, no inheritance.
managed_resources=false by default; true links managed folders/projects and new
orders via platform contract. Unlinked orders need approved platform upgrade + fresh Plan/Apply. No link_scopes with managed coverage.
Managed scopes same-region; others need reviewed routers. link_scopes supports
organization/folder/project. External links need import review.

## Dependencies

Same-region; no workload access to central secrets.

## Dialogue

Editor: label native defaults for missing retention/ACL/Lock; explain Lock.
Explicit USER restrictions win;
no guessed values or other components. Managed: managed_resources=true,
No invented IDs.

## Examples

Missing ACL: default or question; no borrowed Firewall net.

## Limits

Future events only. Default rights exclude audit mutation; Owner/inherited grants
can alter routing: no deny guarantee. Verify query/S3/dashboard delivery/access.
Recovery preserves links; lost secrets need exact approved revocation + fresh
Plan/Apply, never fabricated keys.

## Credentials

No tokens, S3 keys, State or audit contents in chat/public contracts.
Protected execution.

## Sources

No delivery/compliance proof.
