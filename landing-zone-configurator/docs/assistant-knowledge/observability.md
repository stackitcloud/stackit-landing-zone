# Central and Project Observability

## Purpose

Collect operational logs, traces and metrics centrally or within a landing-zone
project. Choose scope and retention from operating needs, not a template label.

## Accelerator Contract

Native root observability configures management monitoring; null disables that
instance. Landing-zone projects and platform_kubernetes have distinct nested
observability settings. Management fields include plan_name, acl and separate
logs/traces/metrics/downsampling retention periods. An enabled project instance
is not automatically the same service or authorization as the central instance.

## Dependencies

Management foundations and credential boundaries. Project/cluster existence,
ingestion paths, access ACLs and the specific nested service contract must match.
Audit logging is a separate function, not proven by ordinary telemetry alone.

## Dialogue

Ask which signals and projects need coverage, required retention, network
access and who operates dashboards. Separate central versus per-project scope.
Use verified live plans/catalogues when available; do not copy static prices,
quotas or assert cross-region availability from a default plan name.

## Examples

Synthetic management fragment: observability = { logs_retention_days = 30,
traces_retention_days = 30 }. Other defaults are resolved by the native schema;
this example is not permission to enable telemetry or select a production plan.

## Limits

Storage/retention estimates require measured data volume and current service
limits. Empty ACLs/defaults must be explained, not called private or secure by
assumption. Dashboard examples and demo metrics are not production coverage.
Complex monitoring chat patches are not introduced by this topic.

## Credentials

Provider provisioning and ingestion/dashboard credentials are separate bindings.
Never request Grafana passwords, service tokens, OTLP secrets or raw customer logs.

## Sources

Management, landing-zone and platform module variables define actual scope.
Manifest sources and engine binding must be refreshed after review; live product
facts stay outside the static topic. This topic is not operational qualification.