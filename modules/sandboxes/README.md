<!-- BEGIN_TF_DOCS -->
### Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.88.0 |

### Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.88.0 |

### Modules

No modules.

### Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_project) | resource |

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for all resources in this module, e.g. "myco-pltfm-net-prod". | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | `null` | no |
| <a name="input_sandboxes"></a> [sandboxes](#input\_sandboxes) | List of sandboxes to create. | <pre>list(object({<br/>    project_name        = string<br/>    owner_emails        = optional(list(string))<br/>    project_owner_email = string<br/>  }))</pre> | `[]` | no |

### Outputs

| Name | Description |
|------|-------------|
| <a name="output_projects"></a> [projects](#output\_projects) | The created STACKIT projects with their IDs, container IDs, and names. |
<!-- END_TF_DOCS -->