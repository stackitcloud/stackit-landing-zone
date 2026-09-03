<div align="center">
<br>
<img src=".github/images/stackit-logo.svg" alt="STACKIT logo" width="50%"/>
<br>
<br>
</div>

# Landing Zone Accelerator

[![Terraform](https://img.shields.io/badge/Terraform-1.15+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.12+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-004E5A)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

The STACKIT Landing Zone Accelerator provides a comprehensive Terraform-based framework for deploying secure, scalable, and well-architected cloud environments on STACKIT. Built with enterprise best practices, it enables teams to quickly establish governance, networking, and security foundations.

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture/Modules](docs/architecture.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Terraform plan for pull requests

Every pull request from a branch in this repository runs an authenticated plan.
The workflow updates a single pull-request comment with the numbers of resources
to add, change, destroy, and replace. A new commit reruns the plan. Pull requests
from forks are skipped because GitHub secrets must not be exposed to untrusted
repositories.

The workflow uses the protected `terraform-plan` environment. A CODEOWNER must
approve the job before GitHub releases its credentials; administrator bypass is
disabled. The workflow expects:

- the environment secret `STACKIT_SERVICE_ACCOUNT_KEY` containing the STACKIT
  service-account key JSON;
- optionally, the repository variable `TF_PLAN_VAR_FILE`, set to a path below
  `src/` (the default is
  `config/hub-and-spoke-prod-nonprod-firewall.tfvars`).

Values in that file can be overridden with the repository variables
`TF_VAR_OWNER_EMAIL`, `TF_VAR_COMPANY_NAME`, `TF_VAR_COMPANY_CODE`,
`TF_VAR_ORGANIZATION_ID`, `TF_VAR_REGION`, `TF_VAR_CONNECTIVITY`, and
`TF_VAR_LANDING_ZONES`. The last two values must be JSON objects. Empty or missing
variables do not override the selected tfvars file. The workflow writes the
configured values to a second, higher-priority tfvars file so the overrides take
precedence over the explicitly selected base file.

The status check `Terraform Plan / PR Plan` must be configured as a required check
in the ruleset or branch protection for the target branch to prevent merging when
the plan fails.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
