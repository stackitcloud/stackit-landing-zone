##################
## CUSTOM ROLES ##
##################

resource "stackit_authorization_project_custom_role" "this" {
  for_each = { for role in var.custom_roles : role.name => role }

  resource_id = stackit_resourcemanager_project.project.project_id
  name        = each.value.name
  description = each.value.description
  permissions = each.value.permissions
}

######################
## ROLE ASSIGNMENTS ##
######################

resource "stackit_authorization_project_role_assignment" "assignments" {
  for_each = { for assignment in var.role_assignments : "${assignment.role}-${assignment.subject}" => assignment }

  resource_id = stackit_resourcemanager_project.project.project_id
  role        = each.value.role
  subject     = each.value.subject

  depends_on = [stackit_authorization_project_custom_role.this]
}

resource "stackit_authorization_project_role_assignment" "sa_owner" {
  resource_id = stackit_resourcemanager_project.project.project_id
  role        = "owner"
  subject     = stackit_service_account.automation.email
}