#####################
## SERVICE ACCOUNT ##
#####################

resource "stackit_service_account" "automation" {
  project_id = stackit_resourcemanager_project.project.project_id
  name       = substr(replace("${local.naming_pattern}-automation", "-", ""), 0, 20)
}

resource "time_rotating" "key_rotate" {
  rotation_days = 60
}

resource "stackit_service_account_key" "automation" {
  project_id            = stackit_resourcemanager_project.project.project_id
  service_account_email = stackit_service_account.automation.email
  ttl_days              = 90

  rotate_when_changed = {
    rotation = time_rotating.key_rotate.id
  }
}

# resource "vault_kv_secret_v2" "service_account_key_automation" {
#   mount               = stackit_secretsmanager_instance.this.instance_id
#   name                = "service_account_key_${stackit_service_account.automation.name}"
#   cas                 = 1
#   delete_all_versions = true
#   data_json           = stackit_service_account_key.automation.json
# }