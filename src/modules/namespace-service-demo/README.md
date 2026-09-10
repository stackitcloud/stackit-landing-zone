<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.11 |
| <a name="requirement_grafana"></a> [grafana](#requirement\_grafana) | >= 4.45.2 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >= 0.114.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_grafana.observability"></a> [grafana.observability](#provider\_grafana.observability) | >= 4.45.2 |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | >= 0.114.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [grafana_dashboard.namespace_overview](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/dashboard) | resource |
| [grafana_data_source.platform_prometheus](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/data_source) | resource |
| [grafana_folder.stackit_managed](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/folder) | resource |
| [stackit_observability_credential.platform_metrics_reader](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/observability_credential) | resource |
| [stackit_observability_scrapeconfig.namespace_demo_ingestion](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/observability_scrapeconfig) | resource |
| [stackit_secretsmanager_user.external_secret_demo](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/secretsmanager_user) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_dashboard_folder_title"></a> [dashboard\_folder\_title](#input\_dashboard\_folder\_title) | Folder title used for managed landing-zone demo dashboards. | `string` | `"STACKIT Managed Dashboards"` | no |
| <a name="input_dashboard_passwords"></a> [dashboard\_passwords](#input\_dashboard\_passwords) | Grafana admin passwords keyed by landing-zone key for dashboard demo imports. | `map(string)` | `{}` | no |
| <a name="input_services"></a> [services](#input\_services) | Enabled namespace-service demo configurations keyed by landing-zone key. | <pre>map(object({<br/>    namespace                              = string<br/>    use_secretsmanager                     = bool<br/>    landing_zone_project_id                = string<br/>    secretsmanager_instance_id             = string<br/>    observability_instance_id              = optional(string)<br/>    observability_grafana_url              = optional(string)<br/>    observability_admin_user               = optional(string)<br/>    demo_metrics_ingestion_enabled         = optional(bool, false)<br/>    demo_metrics_ingestion_target_urls     = optional(list(string), [])<br/>    demo_metrics_ingestion_scheme          = optional(string, "https")<br/>    demo_metrics_ingestion_metrics_path    = optional(string, "/")<br/>    demo_metrics_ingestion_scrape_interval = optional(string, "60s")<br/>    demo_metrics_ingestion_scrape_timeout  = optional(string, "30s")<br/>    platform_project_id                    = optional(string)<br/>    platform_observability_instance_id     = optional(string)<br/>    platform_observability_targets_url     = optional(string)<br/>    dns_zone_name                          = optional(string)<br/>  }))</pre> | `{}` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_samples"></a> [samples](#output\_samples) | Demo sample references for enabled namespace-service demos. |
| <a name="output_secret_access"></a> [secret\_access](#output\_secret\_access) | Credentials for demo Secrets Manager users keyed by landing zone. |
<!-- END_TF_DOCS -->
