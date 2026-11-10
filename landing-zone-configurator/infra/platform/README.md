# Configurator platform

[English](README.md) | [Deutsch](README.de.md)

<a id="configurator-plattform"></a>

This root manages the CF organization and technical org manager, PostgreSQL Flex with database/migration user, Secrets Manager with provisioning user, artifact bucket and AI Model Serving including an auth token. The STACKIT provider enables Model Serving when creating the token.

Region, foundation, quota, DB plan and verified source CIDRs are explicit inputs. No open default ACL. The database owner is intended for migrations, not as the future app user; app roles/RLS and secret policies are added in the runtime layer.

Prerequisites: successfully applied state bootstrap and backend root with versioning enabled. The pipeline passes its backend access through a private temporary output file; normal OpenTofu output remains visible. [IaC instructions](../README.md).

A `sensitive` output masks only the display. Provider-generated credentials reside in encrypted state. Downstream IaC receives only the required outputs; unrestricted provisioning identities are not bound to customer Runners.

## Isolated plan runners

`6-plan-runners.tf` provisions a separate `lzc-dev-runners` CF organisation and
its manager. The initial reviewed plan contains exactly two creates and no changes
or deletes. This is Configurator infrastructure, not a customer Landing Zone apply.
The manager will be used by the trusted dispatcher and release pipeline only;
individual runner apps receive a short-lived per-job ticket, never this identity.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | = 1.12.6 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.114.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.114.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [stackit_modelserving_token.assistant_tests](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/modelserving_token) | resource |
| [stackit_modelserving_token.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/modelserving_token) | resource |
| [stackit_objectstorage_bucket.artifacts](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/objectstorage_bucket) | resource |
| [stackit_postgresflex_database.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/postgresflex_database) | resource |
| [stackit_postgresflex_instance.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/postgresflex_instance) | resource |
| [stackit_postgresflex_user.migration](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/postgresflex_user) | resource |
| [stackit_scf_organization.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/scf_organization) | resource |
| [stackit_scf_organization.plan_runners](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/scf_organization) | resource |
| [stackit_scf_organization_manager.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/scf_organization_manager) | resource |
| [stackit_scf_organization_manager.plan_runners](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/scf_organization_manager) | resource |
| [stackit_secretsmanager_instance.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/secretsmanager_instance) | resource |
| [stackit_secretsmanager_user.provisioner](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/secretsmanager_user) | resource |
| [stackit_scf_platform.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/data-sources/scf_platform) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_cf_platform_id"></a> [cf\_platform\_id](#input\_cf\_platform\_id) | Explicitly chosen CF foundation ID from the project-specific platform catalog. | `string` | n/a | yes |
| <a name="input_cf_quota_id"></a> [cf\_quota\_id](#input\_cf\_quota\_id) | Explicitly chosen quota ID for this CF foundation. | `string` | n/a | yes |
| <a name="input_credential_generation"></a> [credential\_generation](#input\_credential\_generation) | Increment intentionally to rotate supported platform credentials, followed by binding updates. | `string` | `"initial"` | no |
| <a name="input_database"></a> [database](#input\_database) | Explicitly selected PostgreSQL Flex plan, version, storage and backup settings. | <pre>object({<br/>    flavor_id       = string<br/>    version         = string<br/>    storage_class   = string<br/>    storage_size_gb = number<br/>    backup_schedule = string<br/>    retention_days  = number<br/>  })</pre> | n/a | yes |
| <a name="input_database_access_cidrs"></a> [database\_access\_cidrs](#input\_database\_access\_cidrs) | Explicit source networks allowed to access PostgreSQL; not dedicated CF egress IPs. | `set(string)` | n/a | yes |
| <a name="input_name_prefix"></a> [name\_prefix](#input\_name\_prefix) | Stable environment-specific naming prefix. | `string` | n/a | yes |
| <a name="input_production"></a> [production](#input\_production) | Enable production availability requirements without changing existing Dev resources. | `bool` | `false` | no |
| <a name="input_project_id"></a> [project\_id](#input\_project\_id) | Existing STACKIT operator project; this root does not create customer projects. | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | Explicitly selected STACKIT deployment region. | `string` | n/a | yes |
| <a name="input_secrets_access_cidrs"></a> [secrets\_access\_cidrs](#input\_secrets\_access\_cidrs) | Explicit source networks allowed to access Secrets Manager; validate connectivity separately. | `set(string)` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_assistant_test_model_serving_token"></a> [assistant\_test\_model\_serving\_token](#output\_assistant\_test\_model\_serving\_token) | Dedicated synthetic-test inference token; transfer only to the assistant-tests CI environment. |
| <a name="output_cf_runtime"></a> [cf\_runtime](#output\_cf\_runtime) | Sensitive credentials for the later CF runtime root; do not emit into logs. |
| <a name="output_database_migration"></a> [database\_migration](#output\_database\_migration) | Database-owner credentials for a short-lived, route-free migration task only. |
| <a name="output_model_serving_token"></a> [model\_serving\_token](#output\_model\_serving\_token) | Backend-only inference token for the later CF binding; never include in the frontend. |
| <a name="output_plan_runner_cf"></a> [plan\_runner\_cf](#output\_plan\_runner\_cf) | Plan dispatcher only. Never inject these into a customer runner. |
| <a name="output_service_ids"></a> [service\_ids](#output\_service\_ids) | Platform resources for subsequent runtime configuration; not customer deployments. |
<!-- END_TF_DOCS -->