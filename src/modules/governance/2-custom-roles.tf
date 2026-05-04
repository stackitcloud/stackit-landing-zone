##################
## CUSTOM ROLES ##
##################

resource "stackit_authorization_project_custom_role" "this" {
  for_each = { for role in var.custom_roles : role.name => role }

  resource_id = var.organization_id
  name        = each.value.name
  description = each.value.description
  permissions = each.value.permissions
}