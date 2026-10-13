# Kubernetes Namespace Services and Secret Enforcement

## Purpose

Provide supported per-landing-zone namespace slices, scoped Kubernetes access,
optional Secrets Manager integration and explicitly chosen policy/demo services.

## Accelerator Contract

Native landing_zone_namespace_services is keyed by existing landing-zone keys.
Fields cover namespace/dns_subdomain, kubernetes_access, secretsmanager,
secrets_enforcement (mode and break_glass), labels/annotations, sample_load,
demo_enabled and demo_metrics_ingestion. Root derives names and references and
creates supported Kubernetes/Helm objects. Kyverno policy modes and exemptions
follow actual source behavior, not invented universal isolation guarantees.
Current namespace root code references single-region platform/project module
paths; do not infer multi-region namespace parity from regional SKE support.

## Dependencies

Supported platform Kubernetes/provider access and existing project templates.
DNS/gateway, Secrets Manager, observability and demos have distinct prerequisites.
A Kubernetes namespace is not a separate cloud project, VM network or firewall.

## Dialogue

Ask about namespace tenancy, service-account access, external secret flow,
audit versus enforcement needs and narrowly scoped break-glass operations.
Do not turn on sample workloads, public demo routes, ingestion or monitoring
just to demonstrate a production feature. Confirm labels/policies separately.

## Examples

Synthetic opt-out: landing_zone_namespace_services = {}. An enabled entry must
reference a real landing-zone key. Explicit demo/sample_load opt-in remains
separate from namespace and service-account requirements.

## Limits

Current chat cannot patch complex namespace objects or kubeconfig values.
Policy audit is not enforcement; supported strict/other modes must be checked
against their actual match/exemption rules. Break-glass TTL settings are not
proof of operational revocation. Kubernetes/Helm reachability, RBAC, secret flow
and demo behavior need separate integration and runtime tests.

## Credentials

Kubernetes provider access and secret-service bindings remain externally
supplyable and protected. Never expose kubeconfigs, service-account tokens,
secret values or dashboard passwords to the model or example fragments.

## Sources

Namespace root code, demo variables, providers and shared reference validation
are manifest sources. Re-review policy modes, provider selection and regional
constraints before generation; demos do not qualify production tenant isolation.