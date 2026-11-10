# operator-project

[English](README.md) | [Deutsch](README.de.md)

Import oder Erstellung des getrennten Betreiberprojekts und seiner auf dieses Projekt beschränkten Provisionierungsidentität. Verschlüsselten Bootstrap-State und Schlüssel getrennt in Betreiberverwahrung halten. Siehe [Produktionshandbuch](../../docs/production.de.md).

Der technische Referenzblock wird aus der englischen IaC-Quelle generiert.

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
| [stackit_authorization_project_role_assignment.provisioning](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_resourcemanager_project.configurator](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/resourcemanager_project) | resource |
| [stackit_service_account.provisioning](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/service_account) | resource |
| [stackit_service_account_key.provisioning](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/service_account_key) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_credential_generation"></a> [credential\_generation](#input\_credential\_generation) | Change deliberately to rotate the 90-day project provisioning key. | `string` | `"initial"` | no |
| <a name="input_existing_project_container_id"></a> [existing\_project\_container\_id](#input\_existing\_project\_container\_id) | Existing operator-project container ID to import; null creates a new project. | `string` | `null` | no |
| <a name="input_operator_service_account_email"></a> [operator\_service\_account\_email](#input\_operator\_service\_account\_email) | Central provisioning service account; its private key is supplied externally. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Central initial project owner; never a test-user identity. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Explicit organization or folder containing the operator project. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Exact operator project name. | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | Operator region. | `string` | `"eu01"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_project"></a> [project](#output\_project) | Operator project identity for the isolated environment bootstrap. |
| <a name="output_provisioning_key"></a> [provisioning\_key](#output\_provisioning\_key) | Project-scoped provisioning key; publish only to production infrastructure environments. |
<!-- END_TF_DOCS -->