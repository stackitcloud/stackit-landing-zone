resource "stackit_resourcemanager_project" "configurator" {
  name                = var.project_name
  parent_container_id = var.parent_container_id
  owner_email         = var.owner_email

  lifecycle {
    prevent_destroy = true
    # The initial owner is creation-only; existing billing/scope labels remain portal-managed.
    ignore_changes = [owner_email, labels]
  }
}

import {
  for_each = var.existing_project_container_id == null ? {} : { existing = var.existing_project_container_id }
  to       = stackit_resourcemanager_project.configurator
  id       = each.value
}
