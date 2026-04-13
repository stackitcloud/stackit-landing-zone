####################
## OBJECT STORAGE ##
####################

resource "stackit_objectstorage_bucket" "this" {
  name       = "${var.name}-default"
  project_id = stackit_resourcemanager_project.this.project_id
}

resource "stackit_objectstorage_credentials_group" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "${var.name}-default"

  depends_on = [
    stackit_objectstorage_bucket.this
  ]
}

resource "stackit_objectstorage_credential" "this" {
  project_id           = stackit_resourcemanager_project.this.project_id
  credentials_group_id = stackit_objectstorage_credentials_group.this.credentials_group_id
}

resource "vault_kv_secret_v2" "object_storage_credentials" {
 mount               = stackit_secretsmanager_instance.this.instance_id
 name                = "objectstorage_credential_terraform"
 cas                 = 1
 delete_all_versions = true
 data_json = jsonencode(
   {
     ACCESS_KEY        = stackit_objectstorage_credential.this.access_key,
     SECRET_ACCESS_KEY = stackit_objectstorage_credential.this.secret_access_key
   }
 )
}