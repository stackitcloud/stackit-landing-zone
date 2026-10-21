locals {
  # Preserve the complete project UUID and purpose within S3's 63-character limit.
  bucket_names = {
    for purpose in ["default", "tfstate"] : purpose => (
      var.bucket_naming == "project-id"
      ? "${substr(var.naming_pattern, 0, 63 - length(purpose) - 38)}-${stackit_resourcemanager_project.this.project_id}-${purpose}"
      : "${var.naming_pattern}-${purpose}"
    )
  }
}

####################
## OBJECT STORAGE ##
####################

resource "stackit_objectstorage_bucket" "default" {
  name       = local.bucket_names["default"]
  project_id = stackit_resourcemanager_project.this.project_id
}

resource "stackit_objectstorage_bucket" "tfstate" {
  name       = local.bucket_names["tfstate"]
  project_id = stackit_resourcemanager_project.this.project_id

  depends_on = [
    stackit_objectstorage_bucket.default, # "project.create_conflict","msg":"Two concurrent calls try to create the same project"}]}
  ]
}

resource "stackit_objectstorage_credentials_group" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = length(var.naming_pattern) <= 32 ? var.naming_pattern : "${substr(var.naming_pattern, 0, 23)}-${substr(sha256(var.naming_pattern), 0, 8)}"

  depends_on = [
    stackit_objectstorage_bucket.default,
    stackit_objectstorage_bucket.tfstate
  ]
}

resource "stackit_objectstorage_credential" "this" {
  project_id           = stackit_resourcemanager_project.this.project_id
  credentials_group_id = stackit_objectstorage_credentials_group.this.credentials_group_id
}
