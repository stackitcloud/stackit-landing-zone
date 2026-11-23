<div align="center">
<br>
<img src=".github/images/stackit-logo.svg" alt="STACKIT logo" width="50%"/>
<br>
<br>
</div>

# Landing Zone Accelerator

[English](README.md) | [Deutsch](README.de.md)

[![Terraform](https://img.shields.io/badge/Terraform-1.15+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.12+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-004E5A)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

The STACKIT Landing Zone Accelerator provides a comprehensive Terraform-based framework for deploying secure, scalable, and well-architected cloud environments on STACKIT. Built with enterprise best practices, it enables teams to quickly establish governance, networking, and security foundations.

The Accelerator remains independently usable with Terraform/OpenTofu. The
Configurator is optional tooling, not a required API, template engine or state
service. For separate Platform and Application phases, see the
[independent CLI workflow](src/application/README.md#independent-two-phase-cli-workflow).
The platform exports reviewed non-secret references; Application inputs can be
filled manually and use a separate backend/state.

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture/Modules](docs/architecture.md)
- [Repository separation concept](docs/repository-separation-concept.md) - slim standalone Accelerator and separately versioned Configurator
- [Private runner concept](docs/private-runner-concept.md) - STACKIT Git, SNA VM runners, standalone and Configurator operation (architecture proposal)
- [Destroy lifecycle concept](docs/destroy-lifecycle-concept.md) - freeze new deployments, staged teardown and deferred folder cleanup (architecture proposal)
- [Corporate VM connectivity: firewall, NAT and SSH](docs/corporate-vm-connectivity.md)
- [Landing Zone Configurator](landing-zone-configurator/README.md)
- [Customer-installed Configurator](landing-zone-configurator/docs/customer-installation-concept.md) - installation and authentication options (concept)
- [Configurator Architecture](landing-zone-configurator/docs/architecture.md)
- [Configurator User Guide](landing-zone-configurator/docs/user-guide.md)
- [Configurator Development](landing-zone-configurator/docs/development.md)
- [GitHub Actions Workflows](docs/workflows.md) - all pipelines, automatic/manual triggers, UI start instructions, inputs and deployment effects

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local setup, the conventions this repository follows, and what a pull request should contain.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
