################################
## RM FOLDER ROLE ASSIGNMENTS ##
################################

resource "stackit_authorization_folder_role_assignment" "platform_admins" {
  for_each = setsubtract(toset(var.platform_admins), toset(var.organization_owners)) # found a duplicate role assignment

  resource_id = stackit_resourcemanager_folder.platform.folder_id
  role        = "owner"
  subject     = each.value
}

resource "stackit_authorization_folder_role_assignment" "landing_zones_corporate_admins" {
  for_each = setsubtract(toset(var.landing_zone_admins), toset(var.organization_owners))

  resource_id = stackit_resourcemanager_folder.landing_zones_corporate.folder_id
  role        = "owner"
  subject     = each.value
}

resource "stackit_authorization_folder_role_assignment" "landing_zones_public_admins" {
  for_each = setsubtract(toset(var.landing_zone_admins), toset(var.organization_owners))

  resource_id = stackit_resourcemanager_folder.landing_zones_public.folder_id
  role        = "owner"
  subject     = each.value
}