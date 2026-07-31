<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.106.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | ~> 0.14.0 |
| <a name="requirement_vault"></a> [vault](#requirement\_vault) | 5.10.1 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.93.0 |
| <a name="provider_time"></a> [time](#provider\_time) | 0.13.1 |
| <a name="provider_vault"></a> [vault](#provider\_vault) | 5.9.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [stackit_authorization_organization_role_assignment.sa_owner](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/authorization_organization_role_assignment) | resource |
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_logs_access_token.audit_read](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/logs_access_token) | resource |
| [stackit_logs_access_token.audit_write](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/logs_access_token) | resource |
| [stackit_logs_instance.audit](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/logs_instance) | resource |
| [stackit_objectstorage_bucket.audit_logs](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_bucket.default](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_bucket.tfstate](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_objectstorage_compliance_lock.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_compliance_lock) | resource |
| [stackit_objectstorage_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_credential) | resource |
| [stackit_objectstorage_credentials_group.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_credentials_group) | resource |
| [stackit_objectstorage_default_retention.audit_logs](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/objectstorage_default_retention) | resource |
| [stackit_observability_credential.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/observability_credential) | resource |
| [stackit_observability_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/observability_instance) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/resourcemanager_project) | resource |
| [stackit_secretsmanager_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/secretsmanager_instance) | resource |
| [stackit_secretsmanager_user.default](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/secretsmanager_user) | resource |
| [stackit_service_account.automation](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/service_account) | resource |
| [stackit_service_account_federated_identity_provider.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/service_account_federated_identity_provider) | resource |
| [stackit_service_account_key.automation](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/service_account_key) | resource |
| [stackit_telemetrylink.audit](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/telemetrylink) | resource |
| [stackit_telemetryrouter_access_token.audit_link](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/telemetryrouter_access_token) | resource |
| [stackit_telemetryrouter_destination.audit_archive](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/telemetryrouter_destination) | resource |
| [stackit_telemetryrouter_destination.audit_logs](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/telemetryrouter_destination) | resource |
| [stackit_telemetryrouter_instance.audit](https://registry.terraform.io/providers/stackitcloud/stackit/0.106.0/docs/resources/telemetryrouter_instance) | resource |
| [time_rotating.automation](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/rotating) | resource |
| [vault_kv_secret_v2.audit_logs](https://registry.terraform.io/providers/hashicorp/vault/5.10.1/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.object_storage_credentials](https://registry.terraform.io/providers/hashicorp/vault/5.10.1/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.observability](https://registry.terraform.io/providers/hashicorp/vault/5.10.1/docs/resources/kv_secret_v2) | resource |
| [vault_kv_secret_v2.service_account_key_automation](https://registry.terraform.io/providers/hashicorp/vault/5.10.1/docs/resources/kv_secret_v2) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_audit_logs"></a> [audit\_logs](#input\_audit\_logs) | Audit logs configuration. The router forwards to two destinations: OTLP into the Logs instance for querying, and S3 into the audit bucket for long-term archive. retention\_days applies to both, driving the Logs instance retention and, when s3\_object\_lock is enabled, the archive bucket's default retention. link\_scopes defaults to a single organization-wide link; set it to attach individual folders or projects instead. | <pre>object({<br/>    retention_days = optional(number, 30)<br/>    acl            = optional(list(string), null)<br/>    s3_object_lock = optional(bool, false)<br/>    link_scopes = optional(list(object({<br/>      resource_type = string # organization, folder, project<br/>      resource_id   = string<br/>    })), null)<br/>  })</pre> | `null` | no |
| <a name="input_federated_identity_providers"></a> [federated\_identity\_providers](#input\_federated\_identity\_providers) | List of federated identity providers to configure for the management service account. | <pre>list(object({<br/>    name   = string<br/>    issuer = string<br/>    assertions = list(object({<br/>      item     = string<br/>      operator = string<br/>      value    = string<br/>    }))<br/>  }))</pre> | `[]` | no |
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
| ---- | ----------- |
| <a name="output_audit_logs_bucket_name"></a> [audit\_logs\_bucket\_name](#output\_audit\_logs\_bucket\_name) | The name of the object storage bucket archiving audit logs. |
| <a name="output_audit_logs_datasource_url"></a> [audit\_logs\_datasource\_url](#output\_audit\_logs\_datasource\_url) | Datasource URL of the audit Logs instance, usable as a Grafana datasource. |
| <a name="output_audit_logs_instance_id"></a> [audit\_logs\_instance\_id](#output\_audit\_logs\_instance\_id) | The ID of the Logs instance receiving audit logs. |
| <a name="output_audit_telemetry_router_id"></a> [audit\_telemetry\_router\_id](#output\_audit\_telemetry\_router\_id) | The ID of the Telemetry Router collecting audit logs. |
| <a name="output_bucket_name_tfstate"></a> [bucket\_name\_tfstate](#output\_bucket\_name\_tfstate) | The name of the tfstate object storage bucket. |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
| <a name="output_secretsmanager_instance_id"></a> [secretsmanager\_instance\_id](#output\_secretsmanager\_instance\_id) | The ID of the Secrets Manager instance, usable as the vault mount. |
| <a name="output_secretsmanager_password"></a> [secretsmanager\_password](#output\_secretsmanager\_password) | The password of the default Secrets Manager user. |
| <a name="output_secretsmanager_username"></a> [secretsmanager\_username](#output\_secretsmanager\_username) | The username of the default Secrets Manager user. |
| <a name="output_service_account_email"></a> [service\_account\_email](#output\_service\_account\_email) | The email of the created service account. |
<!-- END_TF_DOCS -->