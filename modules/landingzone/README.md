<!-- BEGIN_TF_DOCS -->
### Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.83.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | 0.13.1 |
| <a name="requirement_vault"></a> [vault](#requirement\_vault) | 5.6.0 |

### Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.83.0 |
| <a name="provider_time"></a> [time](#provider\_time) | 0.13.1 |
| <a name="provider_vault"></a> [vault](#provider\_vault) | 5.6.0 |

### Modules

No modules.

### Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_custom_role.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/authorization_project_custom_role) | resource |
| [stackit_authorization_project_role_assignment.assignments](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_authorization_project_role_assignment.sa_owner](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_network.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network) | resource |
| [stackit_objectstorage_bucket.default](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_bucket.tfstate](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/objectstorage_credential) | resource |
| [stackit_objectstorage_credentials_group.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/objectstorage_credentials_group) | resource |
| [stackit_resourcemanager_project.project](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/resourcemanager_project) | resource |
| [stackit_secretsmanager_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/secretsmanager_instance) | resource |
| [stackit_secretsmanager_user.default](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/secretsmanager_user) | resource |
| [stackit_service_account.automation](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/service_account) | resource |
| [stackit_service_account_key.automation](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/service_account_key) | resource |
| [stackit_ske_cluster.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/ske_cluster) | resource |
| [time_rotating.key_rotate](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/rotating) | resource |
| [vault_kv_secret_v2.object_storage_credentials](https://registry.terraform.io/providers/hashicorp/vault/5.6.0/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.service_account_key_automation](https://registry.terraform.io/providers/hashicorp/vault/5.6.0/docs/resources/kv_secret_v2) | resource |

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_company_code"></a> [company\_code](#input\_company\_code) | Company code used in resource naming conventions. | `string` | n/a | yes |
| <a name="input_custom_roles"></a> [custom\_roles](#input\_custom\_roles) | List of custom roles to create for the project. | <pre>list(object({<br/>    name        = string<br/>    description = string<br/>    permissions = list(string)<br/>  }))</pre> | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the project owner. Required for project creation. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_code"></a> [project\_code](#input\_project\_code) | Optional project code for the STACKIT project. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | n/a | yes |
| <a name="input_env"></a> [env](#input\_env) | Environment identifier (e.g., dev, staging, prod) used in resource naming conventions. | `string` | `"dev"` | no |
| <a name="input_kubernetes_clusters"></a> [kubernetes\_clusters](#input\_kubernetes\_clusters) | Map of Kubernetes clusters to create. The key is used as a suffix for the cluster name. | <pre>map(object({<br/>    kubernetes_version                   = string<br/>    enable_kubernetes_version_updates    = optional(bool, true)<br/>    enable_machine_image_version_updates = optional(bool, true)<br/>    hibernations = optional(list(object({<br/>      start    = string<br/>      end      = string<br/>      timezone = optional(string, "Europe/Berlin")<br/>    })), [])<br/>    node_pools = list(object({<br/>      name               = string<br/>      machine_type       = string<br/>      availability_zones = list(string)<br/>      os_version_min     = optional(string)<br/>      minimum            = number<br/>      maximum            = number<br/>      max_surge          = optional(number)<br/>      max_unavailable    = optional(number)<br/>      labels             = optional(map(string))<br/>      taints = optional(list(object({<br/>        key    = string<br/>        value  = string<br/>        effect = string<br/>      })))<br/>    }))<br/>    extensions = optional(object({<br/>      acl = optional(object({<br/>        allowed_cidrs = list(string)<br/>        enabled       = bool<br/>      }))<br/>      dns = optional(object({<br/>        enabled = bool<br/>        zones   = optional(list(string))<br/>      }))<br/>      observability = optional(object({<br/>        enabled     = bool<br/>        instance_id = optional(string)<br/>      }))<br/>    }))<br/>  }))</pre> | `{}` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_network_area_id"></a> [network\_area\_id](#input\_network\_area\_id) | Network Area ID to deploy resources into. Required if network is enabled. | `string` | `null` | no |
| <a name="input_network_prefix_length"></a> [network\_prefix\_length](#input\_network\_prefix\_length) | CIDR block prefix length for the project's network range. | `number` | `null` | no |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for regional resources. | `string` | `"eu01"` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |

### Outputs

| Name | Description |
|------|-------------|
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
<!-- END_TF_DOCS -->