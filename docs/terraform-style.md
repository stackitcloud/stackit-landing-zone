# Terraform Style Guide

This file defines the Terraform style conventions for this repository, based on the [HashiCorp Terraform Style Guide](https://developer.hashicorp.com/terraform/language/style). All Terraform code in this workspace MUST conform to these rules. When reviewing or generating Terraform code, enforce every rule below.

---

## Code Formatting

- Indent **two spaces** per nesting level.
- Align `=` signs when multiple single-line arguments appear on consecutive lines at the same nesting level:
  ```hcl
  ami           = "abc123"
  instance_type = "t2.micro"
  ```
- Place all arguments at the **top** of a block, then nested blocks **below**, separated by one blank line.
- Use **empty lines** to separate logical groups of arguments within a block.
- **Meta-arguments first**: list meta-arguments (`count`, `for_each`) at the top of a resource block, separated from other arguments by one blank line.
- **Meta-argument blocks last**: place `lifecycle`, `depends_on` blocks at the bottom, separated from other blocks by one blank line.
  ```hcl
  resource "aws_instance" "example" {
    # meta-argument first
    count = 2

    ami           = "abc123"
    instance_type = "t2.micro"

    network_interface {
      # ...
    }

    # meta-argument block last
    lifecycle {
      create_before_destroy = true
    }
  }
  ```
- Separate **top-level blocks** with exactly one blank line.
- Separate **nested blocks** with blank lines, except when grouping related blocks of the same type.
- Run `terraform fmt` before committing. Use `-recursive` to format subdirectories.

## Code Validation

- Run `terraform validate` before committing to check syntax and internal consistency.

## Comments

- Use `#` for **all** comments (single-line and multi-line). Do NOT use `//` or `/* */`.
- Write self-explanatory code; only add comments when necessary to clarify complexity.

## Resource Naming

- Use a **descriptive noun** for every resource name.
- Separate words with **underscores** (`_`), not hyphens or camelCase.
- Do NOT include the resource type in the resource name (the address already contains it).
- Wrap both resource type and name in **double quotes**.

  **Bad:**
  ```hcl
  resource aws_instance webAPI-aws-instance {...}
  ```
  **Good:**
  ```hcl
  resource "aws_instance" "web_api" {...}
  ```

## Resource Order

- Define **data sources before** the resources that reference them so code "builds on itself".
- Within a resource block, order parameters as follows:
  1. `count` or `for_each` meta-argument
  2. Resource-specific non-block parameters
  3. Resource-specific block parameters
  4. `lifecycle` block (if required)
  5. `depends_on` (if required)

## Variables

- Every variable MUST have a `type` and a `description`.
- Provide a `default` for optional variables.
- Set `sensitive = true` for passwords, private keys, and other secrets.
- Use `validation` blocks only when values have uniquely restrictive requirements.
- Order variable parameters:
  1. `type`
  2. `description`
  3. `default` (optional)
  4. `sensitive` (optional)
  5. `validation` blocks

  ```hcl
  variable "db_disk_size" {
    type        = number
    description = "Disk size for the API database"
    default     = 100
  }

  variable "db_password" {
    type        = string
    description = "Database password"
    sensitive   = true
  }
  ```

## Outputs

- Every output MUST have a `description`.
- Order output parameters:
  1. `description`
  2. `value`
  3. `sensitive` (optional)

  ```hcl
  output "web_public_ip" {
    description = "Public IP of the web instance"
    value       = aws_instance.web.public_ip
  }
  ```

## Local Values

- Use local values **sparingly**; overuse makes code harder to understand.
- If referenced in multiple files, define locals in a `locals.tf` file.
- If specific to one file, define locals at the **top** of that file.
- Use descriptive nouns with underscores for local value names.

## Provider Configuration

- Always include a **default provider configuration** (without `alias`).
- Define **all providers** in the same file.
- If multiple instances of a provider exist, define the **default first**.
- For non-default providers, the `alias` parameter must be the **first** parameter in the block.

## Dynamic Resource Count (`count` / `for_each`)

- Use `count` and `for_each` **sparingly**; they add complexity.
- Use `count` when resources are almost identical.
- Use `for_each` when arguments need distinct values not derivable from an integer.
- A common pattern for conditional resources: `count = var.condition ? 1 : 0`.
- If the effect of a meta-argument is not immediately obvious, add a comment.

## File Naming Conventions

- `main.tf` — resource and data source blocks (or split by logical group as the codebase grows).
- `variables.tf` — all variable blocks, in **alphabetical order**.
- `outputs.tf` — all output blocks, in **alphabetical order**.
- `providers.tf` — all `provider` blocks and configuration.
- `terraform.tf` — single `terraform` block with `required_version` and `required_providers`.
- `backend.tf` — backend configuration.
- `locals.tf` — local values (if shared across files).
- `override.tf` — override definitions (use sparingly, comment the original resource).
- When the codebase grows, split resources into logically named files (e.g., `network.tf`, `storage.tf`, `compute.tf`). It should be immediately clear where to find any resource.

## Version Pinning

- Pin **provider versions** in `required_providers`.
- Pin **module versions** to a specific major and minor version.
- Set a minimum `required_version` for the Terraform binary in the `terraform` block.
  ```hcl
  terraform {
    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "5.34.0"
      }
    }
    required_version = ">= 1.7"
  }
  ```
- For registry modules, use the `version` parameter in the `module` block.

## Module Structure

- Group logically related resources into modules.
- Store local (child) modules in `./modules/<module_name>`.
- Follow the [standard module structure](https://developer.hashicorp.com/terraform/language/modules/develop/structure).
- Name module repositories `terraform-<PROVIDER>-<NAME>` if publishing to a registry.

## .gitignore

Do NOT commit:
- `terraform.tfstate` and `terraform.tfstate.*` backup files.
- `.terraform.tfstate.lock.info`.
- `.terraform/` directory.
- Saved plan files (from `terraform plan -out`).
- `.tfvars` files containing sensitive information.

Always commit:
- All `.tf` code files.
- `.terraform.lock.hcl` dependency lock file.
- `.gitignore`.
- `README.md`.

## Secrets Management

- Never store secrets in plain-text Terraform files.
- Use provider-specific environment variables for credentials.
- Use a secrets manager (e.g., HashiCorp Vault) where possible.
- Mark sensitive variables with `sensitive = true`.

## Testing

- Write tests for Terraform modules.
- Run tests as pre-merge checks in pull requests or as CI/CD pipeline steps.

## Linting

- Use a linter such as [TFLint](https://github.com/terraform-linters/tflint) to enforce coding standards.
- Run `terraform fmt` and `terraform validate` before every commit.
