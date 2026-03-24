####################
## OBJECT STORAGE ##
####################

resource "stackit_objectstorage_bucket" "default" {
  name       = "${var.naming_pattern}-default"
  project_id = stackit_resourcemanager_project.this.project_id
}

resource "stackit_objectstorage_bucket" "tfstate" {
  name       = "${var.naming_pattern}-tfstate"
  project_id = stackit_resourcemanager_project.this.project_id

  depends_on = [
    stackit_objectstorage_bucket.default, # "project.create_conflict","msg":"Two concurrent calls try to create the same project"}]}
  ]
}

resource "stackit_objectstorage_credentials_group" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = var.naming_pattern

  depends_on = [
    stackit_objectstorage_bucket.default,
    stackit_objectstorage_bucket.tfstate
  ]
}

resource "stackit_objectstorage_credential" "this" {
  project_id           = stackit_resourcemanager_project.this.project_id
  credentials_group_id = stackit_objectstorage_credentials_group.this.credentials_group_id
}

# resource "vault_kv_secret_v2" "object_storage_credentials" {
#   mount               = stackit_secretsmanager_instance.this.instance_id
#   name                = "service_account_key_${stackit_service_account.automation.name}"
#   cas                 = 1
#   delete_all_versions = true
#   data_json = jsonencode(
#     {
#       ACCESS_KEY        = stackit_objectstorage_credential.this.access_key,
#       SECRET_ACCESS_KEY = stackit_objectstorage_credential.this.secret_access_key
#     }
#   )
# }