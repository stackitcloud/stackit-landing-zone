# Configurator runtime infrastructure

[English](README.md) | [Deutsch](README.de.md)

This root creates the `configurator` space in the existing `lzc-dev` CF organization,
assigns the deployment identity organization membership and the space developer role, and creates separate
PostgreSQL and read-only Secrets Manager application users. The platform's database
migration and Secrets provisioning credentials are not application credentials.

Apply runs only in `.github/workflows/configurator-runtime.yml`, with visible
`tofu init`, `tofu plan` and `tofu apply` steps. State is encrypted with its own
key at `configurator/lzc-dev/runtime/terraform.tfstate` in the workload bucket.
The same workflow-level `configurator-lzc-dev-mutation` concurrency group serializes
all Configurator mutations. No local remote-state applies are supported.

Platform outputs supply CF authentication and existing service IDs through private
files. The sensitive `app_environment` output is intended only for the backend CF
application; never expose it in logs, frontend builds, or unencrypted artifacts.
The app has no database schema grants yet and Secrets access is read-only for this
connectivity milestone. Tenant authorization and credential write operations need
a separate application implementation before onboarding users.

User authorization (2026-09-30): necessary Configurator deployment applies are
approved until the MVP milestone. Saved plans are still reviewed for scope and
GitHub Environment approval is retained. Changes stay on the feature branch.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | = 1.12.6 |
| <a name="requirement_cloudfoundry"></a> [cloudfoundry](#requirement\_cloudfoundry) | 1.17.0 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.114.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_cloudfoundry"></a> [cloudfoundry](#provider\_cloudfoundry) | 1.17.0 |
| <a name="provider_cloudfoundry.runners"></a> [cloudfoundry.runners](#provider\_cloudfoundry.runners) | 1.17.0 |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.114.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [cloudfoundry_domain.application](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/domain) | resource |
| [cloudfoundry_org_role.deployer_member](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/org_role) | resource |
| [cloudfoundry_org_role.runner_member](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/org_role) | resource |
| [cloudfoundry_service_credential_binding.dispatcher](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/service_credential_binding) | resource |
| [cloudfoundry_service_credential_binding.release](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/service_credential_binding) | resource |
| [cloudfoundry_service_instance.dispatcher](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/service_instance) | resource |
| [cloudfoundry_service_instance.release](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/service_instance) | resource |
| [cloudfoundry_space.configurator](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/space) | resource |
| [cloudfoundry_space.plan_runners](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/space) | resource |
| [cloudfoundry_space_role.deployer](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/space_role) | resource |
| [cloudfoundry_space_role.runner_developer](https://registry.terraform.io/providers/cloudfoundry/cloudfoundry/1.17.0/docs/resources/space_role) | resource |
| [stackit_dns_record_set.application](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/dns_record_set) | resource |
| [stackit_dns_zone.application](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/dns_zone) | resource |
| [stackit_postgresflex_user.application](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/postgresflex_user) | resource |
| [stackit_secretsmanager_user.application](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/secretsmanager_user) | resource |
| [stackit_postgresflex_instance.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/data-sources/postgresflex_instance) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_cf_org_id"></a> [cf\_org\_id](#input\_cf\_org\_id) | n/a | `string` | n/a | yes |
| <a name="input_cf_username"></a> [cf\_username](#input\_cf\_username) | n/a | `string` | n/a | yes |
| <a name="input_credential_generation"></a> [credential\_generation](#input\_credential\_generation) | n/a | `string` | `"initial"` | no |
| <a name="input_database_instance_id"></a> [database\_instance\_id](#input\_database\_instance\_id) | n/a | `string` | n/a | yes |
| <a name="input_dns_contact_email"></a> [dns\_contact\_email](#input\_dns\_contact\_email) | Central operator contact for the DNS zone. | `string` | `null` | no |
| <a name="input_dns_zone"></a> [dns\_zone](#input\_dns\_zone) | Dedicated DNS zone for the application endpoint. | `string` | `null` | no |
| <a name="input_model_serving_token"></a> [model\_serving\_token](#input\_model\_serving\_token) | n/a | `string` | n/a | yes |
| <a name="input_production"></a> [production](#input\_production) | Create isolated production deployment identities and the public endpoint. | `bool` | `false` | no |
| <a name="input_project_id"></a> [project\_id](#input\_project\_id) | n/a | `string` | n/a | yes |
| <a name="input_public_domain"></a> [public\_domain](#input\_public\_domain) | Exact public application hostname; no wildcard certificate. | `string` | `null` | no |
| <a name="input_region"></a> [region](#input\_region) | n/a | `string` | n/a | yes |
| <a name="input_runner_cf_org_id"></a> [runner\_cf\_org\_id](#input\_runner\_cf\_org\_id) | n/a | `string` | n/a | yes |
| <a name="input_runner_cf_password"></a> [runner\_cf\_password](#input\_runner\_cf\_password) | n/a | `string` | n/a | yes |
| <a name="input_runner_cf_username"></a> [runner\_cf\_username](#input\_runner\_cf\_username) | n/a | `string` | n/a | yes |
| <a name="input_secrets_instance_id"></a> [secrets\_instance\_id](#input\_secrets\_instance\_id) | n/a | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_app_environment"></a> [app\_environment](#output\_app\_environment) | Backend-only runtime credentials; never print or include in frontend assets. |
| <a name="output_dispatcher_credentials"></a> [dispatcher\_credentials](#output\_dispatcher\_credentials) | Space-scoped Runner dispatcher; has no access to application bindings. |
| <a name="output_public_endpoint"></a> [public\_endpoint](#output\_public\_endpoint) | DNS and private CF domain; TLS issuance is checked independently after route mapping. |
| <a name="output_release_credentials"></a> [release\_credentials](#output\_release\_credentials) | Space-scoped application deployer; never publish organization-manager credentials to release. |
| <a name="output_runner_space"></a> [runner\_space](#output\_runner\_space) | n/a |
| <a name="output_space"></a> [space](#output\_space) | Application CF space identity. |
<!-- END_TF_DOCS -->