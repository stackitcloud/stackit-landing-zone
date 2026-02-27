#############
## PROJECT ##
#############

locals {
  project_labels = merge(
    var.network_area_id != null ? { "networkArea" = var.network_area_id } : {},
    var.labels
  )
  labels = length(local.project_labels) > 0 ? local.project_labels : null # provider bug: empty map becomes null after apply
}

resource "stackit_resourcemanager_project" "project" {
  parent_container_id = var.parent_container_id
  name                = local.naming_pattern
  owner_email         = var.owner_email
  labels              = local.labels

  lifecycle {
    ignore_changes = [
      labels
    ]
  }
}