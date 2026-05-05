#####################
## SECRETS MANAGER ##
#####################

resource "stackit_secretsmanager_instance" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "${var.naming_pattern}-default"
  # acls       = length(var.secretsmanager_config.acls) > 0 ? var.secretsmanager_config.acls : null
}