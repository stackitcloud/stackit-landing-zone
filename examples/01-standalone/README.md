<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.88.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_devops"></a> [devops](#module\_devops) | ../../modules/devops | n/a |
| <a name="module_governance"></a> [governance](#module\_governance) | ../../modules/governance | n/a |
| <a name="module_landing_zone"></a> [landing\_zone](#module\_landing\_zone) | ../../modules/landing-zone | n/a |
| <a name="module_management"></a> [management](#module\_management) | ../../modules/management | n/a |
| <a name="module_sandboxes"></a> [sandboxes](#module\_sandboxes) | ../../modules/sandboxes | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_company_code"></a> [company\_code](#input\_company\_code) | Company code used in resource naming conventions. | `string` | n/a | yes |
| <a name="input_company_name"></a> [company\_name](#input\_company\_name) | Name of the company. | `string` | n/a | yes |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_landing_zones"></a> [landing\_zones](#input\_landing\_zones) | Map of landing zones to create (public, without network area). | <pre>map(object({<br/>    project_name = string<br/>    project_code = string<br/>    owner_email  = string<br/>    env          = optional(string, "dev")<br/>    role_assignments = optional(list(object({<br/>      role    = string<br/>      subject = string<br/>    })), [])<br/>    network_prefix_length = optional(number, null)<br/>    custom_roles = optional(list(object({<br/>      name        = string<br/>      description = string<br/>      permissions = list(string)<br/>    })), [])<br/>  }))</pre> | `{}` | no |
| <a name="input_organization_auditors"></a> [organization\_auditors](#input\_organization\_auditors) | List of organization auditors. | `list(string)` | `[]` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root organization. | `string` | n/a | yes |
| <a name="input_organization_owners"></a> [organization\_owners](#input\_organization\_owners) | List of organization owners. | `list(string)` | `[]` | no |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_platform_admins"></a> [platform\_admins](#input\_platform\_admins) | List of platform administrators. | `list(string)` | `[]` | no |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for regional resources. | `string` | `"eu01"` | no |
| <a name="input_sandboxes"></a> [sandboxes](#input\_sandboxes) | List of sandboxes to create. | <pre>list(object({<br/>    project_name        = string<br/>    owner_emails        = optional(list(string))<br/>    project_owner_email = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_devops_project_id"></a> [devops\_project\_id](#output\_devops\_project\_id) | The project ID of the DevOps project. |
| <a name="output_governance_folder_ids"></a> [governance\_folder\_ids](#output\_governance\_folder\_ids) | Map of governance folder names to their container IDs. |
| <a name="output_landing_zone_projects"></a> [landing\_zone\_projects](#output\_landing\_zone\_projects) | Map of landing zone project IDs. |
| <a name="output_management_project_id"></a> [management\_project\_id](#output\_management\_project\_id) | The project ID of the Management project. |
| <a name="output_sandbox_projects"></a> [sandbox\_projects](#output\_sandbox\_projects) | The created sandbox projects. |
<!-- END_TF_DOCS -->