# Central and Project Observability

## Purpose

Choose signals, scope, retention and dashboard access for operating needs.

## Accelerator Contract

observability=null disables central management monitoring. Project and
platform_kubernetes have separate nested observability contracts. Central fields:
plan_name, acl and logs/traces/metrics/downsampling retention. Project monitoring
implies neither central monitoring nor its authorization.

## Dependencies

Management, credentials, project/cluster, ingestion and deliberate ACLs.
Telemetry does not prove audit logging.

## Dialogue

Clarify signals/projects, retention and access. Reuse live plan catalogues;
native defaults prove no availability, quota, price or cross-region support.

## Examples

For metrics_retention_days=30, propose that value and the user's plan/ACL.
Omit other retention overrides; do not copy sample values or repeat answered ACLs.
All central retention fields accept null/omission for service defaults.
Fresh live capacities override static families per signal; missing data uses the
reviewed fallback, not an availability claim. Monitoring has metrics only;
Frontend/MetricsEndpoint have no configurable retention. Unknown support is not
permission. Whole-day limits: logs/traces 1-30, metrics/downsampling 1-780.
Never change plans or discard saved values silently. Optional overrides are not
mandatory decisions. Editor, preparation and proposal acceptance share validation.

## Limits

Estimates need measured volume and current limits. Default ACLs are not
inherently private. Demos prove no production coverage. Typed Editor proposals
change only the local draft; execution is separate.

## Credentials

Separate provisioning from ingestion/dashboard access. No passwords, tokens,
OTLP secrets or customer logs in chat.

## Sources

Native variables and manifest/engine binding; refresh after review.
Live product facts and operational qualification remain separate.
