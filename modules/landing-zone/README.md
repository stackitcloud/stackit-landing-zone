<!-- BEGIN_TF_DOCS -->
### Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.88.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >=0.13.1 |

### Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.88.0 |
| <a name="provider_time"></a> [time](#provider\_time) | 0.13.1 |

### Modules

No modules.

### Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_custom_role.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_custom_role) | resource |
| [stackit_authorization_project_role_assignment.sa_owner](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_network.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network) | resource |
| [stackit_objectstorage_bucket.default](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_bucket.tfstate](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_credential) | resource |
| [stackit_objectstorage_credentials_group.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_credentials_group) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_project) | resource |
| [stackit_secretsmanager_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/secretsmanager_instance) | resource |
| [stackit_secretsmanager_user.default](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/secretsmanager_user) | resource |
| [stackit_service_account.automation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/service_account) | resource |
| [stackit_service_account_key.automation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/service_account_key) | resource |
| [time_rotating.key_rotate](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/rotating) | resource |

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_custom_roles"></a> [custom\_roles](#input\_custom\_roles) | List of custom roles to create for the project. | <pre>list(object({<br/>    name        = string<br/>    description = string<br/>    permissions = list(string)<br/>  }))</pre> | n/a | yes |
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for all resources in this module, e.g. "myco-pltfm-net-prod". | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the project owner. Required for project creation. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_network_area_id"></a> [network\_area\_id](#input\_network\_area\_id) | Network Area ID to deploy resources into. Required if network is enabled. | `string` | `null` | no |
| <a name="input_network_prefix_length"></a> [network\_prefix\_length](#input\_network\_prefix\_length) | CIDR block prefix length for the project's network range. | `number` | `null` | no |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | `null` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |

### Outputs

| Name | Description |
|------|-------------|
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
<!-- END_TF_DOCS -->