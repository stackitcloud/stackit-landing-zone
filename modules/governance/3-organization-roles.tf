##########################
## ORG ROLE ASSIGNMENTS ##
##########################

resource "stackit_authorization_organization_role_assignment" "owner" {
  for_each = toset(var.organization_owners)

  resource_id = var.organization_id
  role        = "owner"
  subject     = each.value
}

resource "stackit_authorization_organization_role_assignment" "auditor" {
  for_each = toset(var.organization_auditors)

  resource_id = var.organization_id
  role        = "organization.auditor"
  subject     = each.value
}