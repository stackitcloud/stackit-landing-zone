#####################
## SECRETS MANAGER ##
#####################

resource "stackit_secretsmanager_instance" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "${var.naming_pattern}-default"
  # acls       = length(var.secretsmanager_config.acls) > 0 ? var.secretsmanager_config.acls : null
}

resource "stackit_secretsmanager_user" "default" {
  project_id    = stackit_resourcemanager_project.this.project_id
  instance_id   = stackit_secretsmanager_instance.this.instance_id
  description   = "Default user for accessing the Secrets Manager"
  write_enabled = true
}