resource "stackit_objectstorage_bucket" "artifacts" {
  project_id = var.project_id
  name       = "${var.name_prefix}-artifacts-${substr(var.project_id, 0, 8)}"
  lifecycle {
    prevent_destroy = true
  }
}
