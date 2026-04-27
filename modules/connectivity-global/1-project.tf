#############
## PROJECT ##
#############

resource "stackit_resourcemanager_project" "this" {
  parent_container_id = var.parent_container_id
  name                = var.project_name != null ? var.project_name : var.naming_pattern
  owner_email         = var.owner_email
  labels              = length(var.labels) > 0 ? var.labels : null # provider bug: empty map becomes null after apply
}

resource "stackit_authorization_project_role_assignment" "this" {
  for_each = { for assignment in var.role_assignments : "${assignment.role}-${assignment.subject}" => assignment }

  resource_id = stackit_resourcemanager_project.this.project_id
  role        = each.value.role
  subject     = each.value.subject
}