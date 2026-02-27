#############
## PROJECT ##
#############

resource "stackit_resourcemanager_project" "project" {
  parent_container_id = var.parent_container_id
  name                = local.naming_pattern
  owner_email         = var.owner_email
  labels              = length(local.project_labels) > 0 ? local.project_labels : null # provider bug: empty map becomes null after apply
}

resource "stackit_authorization_project_role_assignment" "assignments" {
  for_each = { for assignment in var.role_assignments : "${assignment.role}-${assignment.subject}" => assignment }

  resource_id = stackit_resourcemanager_project.project.project_id
  role        = each.value.role
  subject     = each.value.subject
}