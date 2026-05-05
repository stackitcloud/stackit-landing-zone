#####################
## SERVICE ACCOUNT ##
#####################

resource "stackit_service_account" "automation" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = substr(replace("${var.naming_pattern}-automation", "-", ""), 0, 20)
}

resource "time_rotating" "key_rotate" {
  rotation_days = 60
}

resource "stackit_service_account_key" "automation" {
  project_id            = stackit_resourcemanager_project.this.project_id
  service_account_email = stackit_service_account.automation.email
  ttl_days              = 90

  rotate_when_changed = {
    rotation = time_rotating.key_rotate.id
  }
}