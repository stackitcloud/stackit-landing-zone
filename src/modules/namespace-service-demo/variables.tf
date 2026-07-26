variable "services" {
  type = map(object({
    namespace                  = string
    use_secretsmanager         = bool
    landing_zone_project_id    = string
    secretsmanager_instance_id = string
    observability_instance_id  = optional(string)
    observability_grafana_url  = optional(string)
    observability_admin_user   = optional(string)
    demo_metrics_ingestion_enabled         = optional(bool, false)
    demo_metrics_ingestion_target_urls     = optional(list(string), [])
    demo_metrics_ingestion_scheme          = optional(string, "https")
    demo_metrics_ingestion_metrics_path    = optional(string, "/")
    demo_metrics_ingestion_scrape_interval = optional(string, "60s")
    demo_metrics_ingestion_scrape_timeout  = optional(string, "30s")
    platform_project_id                = optional(string)
    platform_observability_instance_id = optional(string)
    platform_observability_targets_url = optional(string)
    dns_zone_name              = optional(string)
  }))
  description = "Enabled namespace-service demo configurations keyed by landing-zone key."
  default     = {}
}

variable "dashboard_passwords" {
  type        = map(string)
  description = "Grafana admin passwords keyed by landing-zone key for dashboard demo imports."
  sensitive   = true
  default     = {}
}

variable "dashboard_folder_title" {
  type        = string
  description = "Folder title used for managed landing-zone demo dashboards."
  default     = "STACKIT Managed Dashboards"
}
