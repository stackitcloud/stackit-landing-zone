resource "stackit_authorization_organization_role_assignment" "this" {
  for_each = var.members

  resource_id = var.organization_id
  role        = each.value
  subject     = each.key
}