###################
## OBSERVABILITY ##
###################

# resource "stackit_observability_instance" "this" {
#   project_id                             = stackit_resourcemanager_project.project.project_id
#   name                                   = local.naming_pattern
#   plan_name                              = "Observability-Starter-EU01"
#   # acl                                    = ["1.1.1.1/32", "2.2.2.2/32"]
#   logs_retention_days                    = 30
#   traces_retention_days                  = 30
#   metrics_retention_days                 = 90
#   metrics_retention_days_5m_downsampling = 90
#   metrics_retention_days_1h_downsampling = 90
# }

# resource "stackit_observability_credential" "this" {
#   project_id  = stackit_resourcemanager_project.project.project_id
#   instance_id = stackit_observability_instance.this.instance_id
#   description = "Default credential for accessing the Observability Instance"
# }

# resource "vault_kv_secret_v2" "service_account_key_automation" {
#   mount               = stackit_secretsmanager_instance.this.instance_id
#   name                = "service_account_key_${stackit_service_account.automation.name}"
#   cas                 = 1
#   delete_all_versions = true
#   data_json = jsonencode(
#     {
#       USERNAME = "${stackit_observability_credential.this.username}",
#       PASSWORD = "${stackit_observability_credential.this.password}"
#     }
#   )
# }