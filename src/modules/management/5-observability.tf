###################
## OBSERVABILITY ##
###################

resource "stackit_observability_instance" "this" {
  count = var.observability != null ? 1 : 0

  project_id                             = stackit_resourcemanager_project.this.project_id
  name                                   = var.naming_pattern
  plan_name                              = var.observability.plan_name
  acl                                    = var.observability.acl
  logs_retention_days                    = var.observability.logs_retention_days
  traces_retention_days                  = var.observability.traces_retention_days
  metrics_retention_days                 = var.observability.metrics_retention_days
  metrics_retention_days_5m_downsampling = var.observability.metrics_retention_days_5m_downsampling
  metrics_retention_days_1h_downsampling = var.observability.metrics_retention_days_1h_downsampling
}

resource "stackit_observability_credential" "this" {
  count = var.observability != null ? 1 : 0

  project_id  = stackit_resourcemanager_project.this.project_id
  instance_id = stackit_observability_instance.this[0].instance_id
  description = "Default credential for accessing the Observability Instance"
}

resource "vault_kv_secret_v2" "observability" {
  count = var.observability != null ? 1 : 0

  mount               = stackit_secretsmanager_instance.this.instance_id
  name                = "service_account_key_${stackit_service_account.automation.name}"
  cas                 = 1
  delete_all_versions = true
  data_json = jsonencode(
    {
      USERNAME = stackit_observability_credential.this[0].username,
      PASSWORD = stackit_observability_credential.this[0].password
    }
  )
}