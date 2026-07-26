locals {
  project_labels = merge(
    { "region" = var.region },
    var.network.sna_enabled && var.network.sna_network_area_id != null ? { "networkArea" = var.network.sna_network_area_id } : {},
    var.labels
  )
}

resource "stackit_resourcemanager_project" "this" {
  parent_container_id = var.parent_container_id
  name                = var.project_name != null ? var.project_name : var.naming_pattern
  owner_email         = var.owner_email
  labels              = length(local.project_labels) > 0 ? local.project_labels : null
}

resource "stackit_authorization_project_role_assignment" "this" {
  for_each = { for assignment in var.role_assignments : "${assignment.role}-${assignment.subject}" => assignment }

  resource_id = stackit_resourcemanager_project.this.project_id
  role        = each.value.role
  subject     = each.value.subject
}
