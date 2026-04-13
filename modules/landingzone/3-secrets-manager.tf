#####################
## SECRETS MANAGER ##
#####################

resource "stackit_secretsmanager_instance" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "${var.name}-default"
}

resource "stackit_secretsmanager_user" "this" {
  project_id    = stackit_resourcemanager_project.this.project_id
  instance_id   = stackit_secretsmanager_instance.this.instance_id
  description   = "Default user for accessing the Secrets Manager"
  write_enabled = true
}

resource "vault_kv_secret_v2" "sm_user_credentials" {
 mount               = stackit_secretsmanager_instance.this.instance_id
 name                = "secretmanager_credential_default"
 cas                 = 1
 delete_all_versions = true
 data_json = jsonencode(
   {
     USERNAME = stackit_secretsmanager_user.this.username,
     PASSWORD = stackit_secretsmanager_user.this.password
   }
 )
}