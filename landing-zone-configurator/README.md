# Landing Zone Configurator

[English](README.md) | [Deutsch](README.de.md)

The Configurator is an optional, hosted interface for the
[STACKIT Landing Zone Accelerator](../README.md). It combines a configuration
editor, an Assistant, versioned project templates and explicitly authorized
infrastructure operations. The Accelerator remains independently usable with
Terraform/OpenTofu.

## Start here

| Audience | Documentation |
| --- | --- |
| Users | [User guide](docs/user-guide.md) and [MVP scope and limits](docs/mvp-scope.md) |
| Architects | [Components, diagrams and trust boundaries](docs/architecture.md) |
| Contributors | [Development map](docs/development.md), [local setup](app/README.md) and [contributing](../CONTRIBUTING.md) |
| Operators | [Infrastructure](infra/README.md), [manual CI operations](infra/ci/README.md) and [CF releases](deploy/cloud-foundry/README.md) |

The [development environment](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud)
is not a production service. Production provisioning and operational acceptance
are a separate follow-up; merging source code does not deploy the application.

## How it fits together

![Configurator components](docs/architecture/stackit-overview.svg)

The browser talks to the API, which applies tenant authorization and deterministic
configuration validation. Only the API calls Model Serving. Accepted Assistant
proposals change a draft, not infrastructure. A separate, isolated Runner executes
the pinned Accelerator only after the required Plan/Apply approvals.

![Platform and Application lifecycle](docs/architecture/landing-zone-logical.svg)

Platform configuration, published template versions and Application instances
have separate lifecycles. STACKIT login, tenant membership, optional GitHub access
and technical cloud execution credentials are different permissions.

## Repository layout

- [app/](app/): API, React frontend, worker, domain/compiler and shared contracts.
- [tools/hcl-adapter/](tools/hcl-adapter/): native input catalogue and HCL round trips.
- [deploy/](deploy/): Cloud Foundry packaging, migrations and isolated Runner.
- [infra/](infra/): operator infrastructure with separate encrypted states.
- [docs/](docs/): user, architecture and development references.
- [../src/](../src/): independently consumable Accelerator infrastructure.

Application dependencies and lockfiles are separate from the Accelerator.
Builds pin their Accelerator revision and bind the API/UI and Runner artifacts
to the same source. Customer infrastructure state is not the Configurator's
configuration database or its operator infrastructure state.
