<div align="center">
<br>
<img src=".github/images/stackit-logo.svg" alt="STACKIT logo" width="50%"/>
<br>
<br>
</div>

# Landing Zone Accelerator

[![Terraform](https://img.shields.io/badge/Terraform-1.10+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.11+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-00A9E0)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

The STACKIT Landing Zone Accelerator provides a comprehensive Terraform-based framework for deploying secure, scalable, and well-architected cloud environments on STACKIT. Built with enterprise best practices, it enables teams to quickly establish governance, networking, and security foundations.

## 📚 Documentation

- [Getting Started](docs/getting-started.md)

## Deployment Flavours

Three ready-to-use configurations are provided in `src/config/`:

| Flavour | Config file | Description |
|---------|-------------|-------------|
| **Standalone** | `standalone.tfvars` | Governance, management, devops, and public landing zones only. No network area or firewall. |
| **Hub-Spoke** | `hub-and-spoke.tfvars` | Adds a connectivity hub with a network area and DNS zones. Corporate landing zones connect via the network area. |
| **Hub-Spoke + Firewall** | `hub-and-spoke-firewall.tfvars` | Full hub-spoke topology with a pfSense firewall appliance on the WAN/LAN boundary. |

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Deployment Guide](docs/deployment-guide.md)

## 🔍 Linting (TFLint)

Run locally:

```bash
tflint --init
tflint --recursive
```

Variable validations enforce flavor naming patterns for `firewall.flavor` (connectivity module) and `git_flavor` (devops module). Use `stackit server machine-type list` and the STACKIT Git API docs to verify currently available flavors.

For live validation against current STACKIT SKUs:

```bash
python3 scripts/validate_stackit_flavors.py
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.