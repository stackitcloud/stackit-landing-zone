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
- the environment secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the
  STACKIT Object Storage state backend;
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

### Terraform apply

The `Terraform Apply` workflow is started manually from the Actions page for
`main`, or for an internal pull request by adding the `terraform-apply` label.
Only a CODEOWNER may request either variant. Starting it requires explicit
confirmation for a manual run, followed in both cases by approval from a CODEOWNER
through the protected `terraform-plan` environment.
Administrator bypass is disabled. The workflow creates a fresh plan and applies
that exact saved plan. Normal delete and replacement actions are allowed so the
landing zone can evolve, but deleting or replacing Resource Manager folders is
blocked. A full destroy workflow is deliberately not provided while STACKIT
projects use soft deletion and prevent their parent folders from being deleted
immediately. Apply also fails closed unless OpenTofu has initialized a persistent
remote state backend.

Terraform state is stored in the versioned STACKIT Object Storage bucket
`lza-terraform-state` under `landing-zone/terraform.tfstate`. The S3 backend uses
an adjacent lock file to serialize plan and apply operations.

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
