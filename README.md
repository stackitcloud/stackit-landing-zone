# 🚀 STACKIT Landing Zone Accelerator

**Accelerate your STACKIT cloud adoption with production-ready, modular landing zones.**

[![Terraform](https://img.shields.io/badge/Terraform-1.14+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.11+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-00A9E0)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## ✨ Overview

The STACKIT Landing Zone Accelerator provides a comprehensive Terraform-based framework for deploying secure, scalable, and well-architected cloud environments on STACKIT. Built with enterprise best practices, it enables teams to quickly establish governance, networking, and security foundations.

## 🎯 Key Features

- **🏗️ Modular Architecture** — Compose your infrastructure using reusable, tested Terraform modules
- **🔐 Security First** — Pre-configured RBAC, secrets management, and network segmentation
- **📐 Scalable Templates** — Start small and grow with ready-to-use deployment templates
- **🌐 Multi-Environment** — Seamlessly manage production and non-production workloads
- **⚡ Quick Start** — Get up and running in minutes with sensible defaults

## 📦 Modules

| Module | Description |
|--------|-------------|
| `connectivity-global` | Network areas and regional IP range management including transfer networks and nameservers |
| `connectivity-regional` | Regional connectivity project with WAN/LAN networks, pfSense firewall appliance, public IP, and network area routing |
| `devops` | DevOps project with RBAC and managed Git instance |
| `governance` | Resource Manager folder hierarchy, custom roles, and organization and folder-level role assignments |
| `landing-zone` | Landing zone project with RBAC, networking, Secrets Manager, Object Storage, service accounts, and SKE Kubernetes cluster |
| `management` | Management project with Secrets Manager, Object Storage, service accounts, and observability |
| `sandboxes` | Sandbox projects with RBAC role assignments for experimentation workloads |

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/stackitcloud/stackit-landing-zone.git

# Navigate to a template
cd examples/01-small-scale

# Fill out the values

# Initialize and apply
terraform init
terraform plan
terraform apply
```

📖 See the [Getting Started Guide](docs/getting-started.md) for detailed instructions.

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Deployment Guide](docs/deployment-guide.md)

## 🔍 Linting (TFLint)

The repository includes automated Terraform linting with `tflint` in GitHub Actions.

- Workflow: `.github/workflows/tflint.yml`
- Config: `.tflint.hcl`

Run locally:

```bash
tflint --init
tflint --recursive
```

Additionally, Terraform variable validations enforce flavor naming patterns for:

- `modules/connectivity-regional` (`firewall_flavor`)
- `modules/devops` (`git_flavor`)
- `modules/landing-zone` (`kubernetes_clusters[*].node_pools[*].machine_type`)

Use `stackit server machine-type list` and the STACKIT Git API docs to verify currently available flavors.

For live validation against current STACKIT SKUs, CI also runs:

```bash
python3 scripts/validate_stackit_flavors.py
```

By default it uses `https://pim.api.stackit.cloud/v2/skus` and fails if a configured flavor is not currently available.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
<!-- BEGIN_TF_DOCS -->
### Requirements

No requirements.

### Providers

No providers.

### Modules

No modules.

### Resources

No resources.

### Inputs

No inputs.

### Outputs

No outputs.
<!-- END_TF_DOCS -->