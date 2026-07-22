# Issue 41 Update Draft

Title suggestion:
Gateway API DNS extension gap in Terraform provider: temporary record-set bridge for Envoy Gateway

## Summary
We migrated from NGINX ingress to Envoy Gateway / Gateway API (`Gateway` + `HTTPRoute`) for the namespace demo path.

The remaining platform/provider gap is Terraform support for `extensions.dns.gatewayApi`.
Until this is available in the provider, DNS must be managed via Terraform `stackit_dns_record_set` resources.

## Current stable workaround
- Discover Envoy-managed LoadBalancer service endpoint in-cluster via Terraform (`kubernetes_resources` + labels).
- Create DNS record set in the corresponding landing-zone DNS zone:
  - `A` when an IP endpoint is available.
  - `CNAME` when a hostname endpoint is available.
- Keep record creation guarded by a precondition that requires a resolvable endpoint.

## Why this replaced the first workaround idea
Initial workaround ideas depended on provider features that were not consistently available in OpenTofu runtime schema / behavior.
The record-set bridge is now purely Terraform-managed, deterministic, and validated in apply/plan cycles.

## Acceptance criteria for closing this issue
- Terraform provider exposes and supports `extensions.dns.gatewayApi` end-to-end for Gateway API resources.
- Existing record-set bridge can be removed without losing automated DNS convergence for Gateway API listeners.

## Requested provider capability
Please add first-class Terraform support for DNS automation based on Gateway API listeners/hostnames (`extensions.dns.gatewayApi`) so manual record-set bridging is no longer necessary.
