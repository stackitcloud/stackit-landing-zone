# Architecture Diagrams

## Customer topology diagrams

The customer-facing topology diagrams are maintained directly as SVG files. They intentionally show the defining network boundaries, projects, and traffic paths of each complete configuration rather than every Terraform resource.

- `standalone.svg`
- `hub-and-spoke.svg`
- `hub-and-spoke-firewall.svg`
- `hub-and-spoke-finance-research.svg`
- `hub-and-spoke-multi-area.svg`
- `hub-and-spoke-multi-region.svg`
- `hub-and-spoke-prod-nonprod-firewall.svg`
- `hub-and-spoke-tenant-isolation.svg`

Each filename matches its source file in `src/config/`, apart from the image extension. Keep these diagrams stable and review visual changes alongside the corresponding configuration.

## Legacy generator

`scripts/generate_example_architecture.py` remains available as a manual development aid. It is not invoked by GitHub Actions, repository task configuration, or another automated pipeline. Its Mermaid output is temporary and is not part of the maintained documentation.