# 🚀 STACKIT Landing Zone Accelerator

**Accelerate your STACKIT cloud adoption with production-ready, modular landing zones.**

[![Terraform](https://img.shields.io/badge/Terraform-1.10+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.11+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-00A9E0)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## ✨ Overview

The STACKIT Landing Zone Accelerator provides a comprehensive Terraform-based framework for deploying secure, scalable, and well-architected cloud environments on STACKIT. Built with enterprise best practices, it enables teams to quickly establish governance, networking, and security foundations.

## 🎯 Key Features

- **🏗️ Modular Architecture** — Compose your infrastructure using reusable, tested Terraform modules
- **🔐 Security First** — Pre-configured RBAC, secrets management, and network segmentation
- **📐 Three Deployment Flavours** — Start standalone and evolve to hub-spoke with or without a firewall
- **🌐 Multi-Environment** — Seamlessly manage production and non-production workloads
- **⚡ Quick Start** — Get up and running in minutes with sensible defaults

## 📦 Modules

| Module | Description |
|--------|-------------|
| `connectivity` | Connectivity hub project with network area, WAN/LAN networks, optional pfSense firewall, and DNS zones |
| `devops` | DevOps project with RBAC and managed Git instance |
| `governance` | Resource Manager folder hierarchy, custom roles, and organization-level role assignments |
| `landing-zone` | Landing zone project with RBAC, networking, Secrets Manager, Object Storage, and service accounts |
| `management` | Management project with Secrets Manager, Object Storage, service accounts, and observability |
| `sandboxes` | Sandbox projects with RBAC role assignments for experimentation workloads |

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/stackitcloud/stackit-landing-zone.git
cd stackit-landing-zone/src

# Copy and edit the tfvars for your desired flavour (see Deployment Flavours below)
cp config/standalone.tfvars terraform.auto.tfvars

# Initialize and deploy
tofu init
tofu plan
tofu apply
```

📖 See the [Getting Started Guide](docs/getting-started.md) for detailed instructions.

## 🗂️ Deployment Flavours

Three ready-to-use configurations are provided in `src/config/`:

| Flavour | Config file | Description |
|---------|-------------|-------------|
| **Standalone** | `standalone.tfvars` | Governance, management, devops, and public landing zones only. No network area or firewall. |
| **Hub-Spoke** | `hub-and-spoke.tfvars` | Adds a connectivity hub with a network area and DNS zones. Corporate landing zones connect via the network area. |
| **Hub-Spoke + Firewall** | `hub-and-spoke-firewall.tfvars` | Full hub-spoke topology with a pfSense firewall appliance on the WAN/LAN boundary. |

## 🧪 Testing

Tests for all three flavours are located in `src/tests/` and use the native OpenTofu test framework:

```bash
cd src
tofu test
```

| Test file | Flavour tested |
|-----------|---------------|
| `standalone.tftest.hcl` | Standalone — no connectivity module |
| `hub_spoke.tftest.hcl` | Hub-spoke without and with firewall (two runs) |
| `hub_spoke_firewall.tftest.hcl` | Hub-spoke with firewall |

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