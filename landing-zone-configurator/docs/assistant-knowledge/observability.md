# Central and Project Observability

## Purpose

Logs, traces and metrics centrally or per project; scope and retention follow
operating needs, not template labels.

## Accelerator Contract

observability=null disables central management monitoring. Project and
platform_kubernetes observability have separate nested contracts. Central fields:
plan_name, acl, logs/traces/metrics and downsampling retention periods. A project
instance does not imply the same central service or authorization.

## Dependencies

Management, credentials, project/cluster, ingestion paths and deliberate ACLs.
Respect nested scope. Ordinary telemetry does not prove audit logging.

## Dialogue

Clarify signals/projects, retention needs, access and dashboard operation.
Separate central/project scope. Reuse live plans/catalogues; a native default
plan name does not prove availability, quotas, prices or cross-region support.

## Examples

metrics_retention_days=30: propose that choice and the user's plan/ACL. Omit other
retention overrides to inherit native defaults; do not copy sample logs/traces
values or ask for answered ACLs. Optional retentions are not mandatory decisions.

## Limits

Estimates need measured volume and current limits. Empty/default ACLs are not
automatically private or secure. Demos do not prove production coverage.
Typed native Editor proposals change only the local draft; execution is separate.

## Credentials

Separate provisioning from ingestion/dashboard credentials. No Grafana
passwords, service tokens, OTLP secrets or raw customer logs in chat.

## Sources

Management/project/platform variables and manifest/engine binding. Refresh after
review. Live product facts and operational qualification remain separate.