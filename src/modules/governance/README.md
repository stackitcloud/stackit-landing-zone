<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.93.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >= 0.13.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.93.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [stackit_authorization_folder_role_assignment.owners](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_folder_role_assignment) | resource |
| [stackit_authorization_folder_role_assignment.readers](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_folder_role_assignment) | resource |
| [stackit_authorization_organization_role_assignment.auditor](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_organization_role_assignment) | resource |
| [stackit_authorization_organization_role_assignment.owner](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_organization_role_assignment) | resource |
| [stackit_authorization_project_custom_role.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_custom_role) | resource |
| [stackit_resourcemanager_folder.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_folder) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_custom_roles"></a> [custom\_roles](#input\_custom\_roles) | List of custom roles to create at the organization level. | <pre>list(object({<br/>    name        = string<br/>    description = string<br/>    permissions = list(string)<br/>  }))</pre> | `[]` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all folders. | `map(string)` | `{}` | no |
| <a name="input_organization_auditors"></a> [organization\_auditors](#input\_organization\_auditors) | List of organization role assignments for organization auditors. | `list(string)` | `[]` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root folder or organization under which the company folder will be created. | `string` | n/a | yes |
| <a name="input_organization_owners"></a> [organization\_owners](#input\_organization\_owners) | List of organization role assignments for organization owners. | `list(string)` | `[]` | no |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner for the folders. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_rm_folder_parent_id"></a> [rm\_folder\_parent\_id](#input\_rm\_folder\_parent\_id) | ID of the parent folder under which the resource manager folders will be created. If not provided, the resource manager folders will be created under the organization. | `string` | `null` | no |
| <a name="input_rm_folders"></a> [rm\_folders](#input\_rm\_folders) | Map of folder keys to folder configuration. Each folder has a display name and optional lists of owner and reader subjects. | <pre>map(object({<br/>    name          = string<br/>    owner_emails  = optional(list(string), [])<br/>    reader_emails = optional(list(string), [])<br/>  }))</pre> | <pre>{<br/>  "landing_zones_corporate": {<br/>    "name": "Landing Zones - Corporate",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "landing_zones_public": {<br/>    "name": "Landing Zones - Public",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "platform": {<br/>    "name": "Platform",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "sandbox": {<br/>    "name": "Sandboxes",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  }<br/>}</pre> | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_custom_role_ids"></a> [custom\_role\_ids](#output\_custom\_role\_ids) | Map of custom role names to their role IDs |
| <a name="output_folder_container_ids"></a> [folder\_container\_ids](#output\_folder\_container\_ids) | Map of all folder keys to their container IDs for easy reference |
| <a name="output_organization_role_assignments"></a> [organization\_role\_assignments](#output\_organization\_role\_assignments) | Map of organization-level role assignment subjects grouped by role |
<!-- END_TF_DOCS -->