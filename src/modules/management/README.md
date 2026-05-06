<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.93.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >=0.13.1 |
| <a name="requirement_vault"></a> [vault](#requirement\_vault) | >=5.7.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.93.0 |
| <a name="provider_time"></a> [time](#provider\_time) | 0.13.1 |
| <a name="provider_vault"></a> [vault](#provider\_vault) | 5.9.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [stackit_authorization_organization_role_assignment.sa_owner](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_organization_role_assignment) | resource |
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_objectstorage_bucket.default](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_bucket.tfstate](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_credential) | resource |
| [stackit_objectstorage_credentials_group.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/objectstorage_credentials_group) | resource |
| [stackit_observability_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/observability_credential) | resource |
| [stackit_observability_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/observability_instance) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_project) | resource |
| [stackit_secretsmanager_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/secretsmanager_instance) | resource |
| [stackit_secretsmanager_user.default](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/secretsmanager_user) | resource |
| [stackit_service_account.automation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/service_account) | resource |
| [stackit_service_account_key.automation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/service_account_key) | resource |
| [time_rotating.key_rotate](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/rotating) | resource |
| [vault_kv_secret_v2.object_storage_credentials](https://registry.terraform.io/providers/hashicorp/vault/latest/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.observability](https://registry.terraform.io/providers/hashicorp/vault/latest/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.service_account_key_automation](https://registry.terraform.io/providers/hashicorp/vault/latest/docs/resources/kv_secret_v2) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all folders. | `map(string)` | `{}` | no |
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for all resources in this module, e.g. "myco-pltfm-hub-prod". | `string` | n/a | yes |
| <a name="input_observability"></a> [observability](#input\_observability) | Observability instance configuration. Set to null to skip observability deployment. | <pre>object({<br/>    plan_name                              = optional(string, "Observability-Starter-EU01")<br/>    acl                                    = optional(list(string), [])<br/>    logs_retention_days                    = optional(number, 30)<br/>    traces_retention_days                  = optional(number, 30)<br/>    metrics_retention_days                 = optional(number, 90)<br/>    metrics_retention_days_5m_downsampling = optional(number, 90)<br/>    metrics_retention_days_1h_downsampling = optional(number, 90)<br/>  })</pre> | `null` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root folder or organization under which the company folder will be created. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner for the folders. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | `null` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_bucket_name_tfstate"></a> [bucket\_name\_tfstate](#output\_bucket\_name\_tfstate) | The name of the tfstate object storage bucket. |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
| <a name="output_secretsmanager_password"></a> [secretsmanager\_password](#output\_secretsmanager\_password) | The password of the default Secrets Manager user. |
| <a name="output_secretsmanager_username"></a> [secretsmanager\_username](#output\_secretsmanager\_username) | The username of the default Secrets Manager user. |
| <a name="output_service_account_email"></a> [service\_account\_email](#output\_service\_account\_email) | The email of the created service account. |
<!-- END_TF_DOCS -->