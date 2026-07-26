<!-- BEGIN_TF_DOCS -->

## Platform Kubernetes Module

This module provisions a central, region-scoped platform Kubernetes foundation:

- Dedicated platform project
- SKE cluster with SNA/public network mode support
- HA baseline defaults: two node pools across two AZs with minimum two nodes per pool
- Optional central observability extension wiring
- Optional DNS extension wiring
- Optional encrypted volume foundation via KMS and Act-As IAM wiring

Run tfdocs/pre-commit hooks to regenerate full inputs/outputs documentation.

<!-- END_TF_DOCS -->
