# Audit Routing and Archive Retention

## Purpose

Capture organizational control-plane audit events for investigation and archive
them with deliberately chosen access, scope and retention.

## Accelerator Contract

Native audit_logs is optional; null skips its management resources. The module
routes audit events to an OTLP Logs destination and an object-storage archive.
Fields include retention_days, acl, s3_object_lock and link_scopes containing
resource_type/resource_id. Default scope is organization-wide; explicit scopes
support organization, folder or project. With Object Lock enabled, the native
contract limits retention to 1..365 days. Query retention and archive policy
must be distinguished from backups or legal compliance certification.

## Dependencies

Management foundations, organization access and externally supplied credentials.
Link scope must belong to authorized resources. Central observability and audit
logging are distinct optional services.

## Dialogue

Ask about audit obligations, retention period, organizational versus selected
scope, reader access and retention/deletion constraints. Describe Object Lock's
consequences before a proposal. Resolve resource selections through authorized
interfaces; never ask customers to paste internal scope IDs or raw audit logs.

## Examples

Synthetic fragment: audit_logs = { retention_days = 180,
s3_object_lock = true }. It uses native defaults for other fields; it is not a
legal retention recommendation or an instruction to enable audit automatically.

## Limits

Object Lock can constrain deletion independently of Configurator conversation
expiry. Audit-router configuration does not prove delivered events or all scopes
covered. Scope, permissions, ingestion and archive retrieval require separate
tests. Native Editor proposals support typed audit settings; new instances need
explicit retention, ACL and Object Lock decisions, not sample/default consent.

## Credentials

Archive and ingestion credentials belong to secure execution bindings. Never
send S3 keys, OTLP tokens, archive contents or compliance evidence to the model.

## Sources

Root and management contracts pin scope and retention behavior. Re-review
service limits and implementation changes rather than silently promoting source
hashes. External compliance and provider freshness are not asserted here.