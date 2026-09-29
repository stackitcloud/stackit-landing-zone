# Creating the first bucket also enables Object Storage through the STACKIT provider.
resource "stackit_objectstorage_bucket" "state" {
  project_id = var.project_id
  name       = "${var.name_prefix}-state-${substr(var.project_id, 0, 8)}"
  lifecycle {
    prevent_destroy = true
  }
}

resource "stackit_objectstorage_credentials_group" "state" {
  project_id = var.project_id
  name       = "${var.name_prefix}-state-operators"
  depends_on = [stackit_objectstorage_bucket.state]
}

resource "stackit_objectstorage_credential" "state" {
  project_id           = var.project_id
  credentials_group_id = stackit_objectstorage_credentials_group.state.credentials_group_id
  expiration_timestamp = var.state_credential_expiration
}
