resource "stackit_resourcemanager_folder" "this" {
  name                = var.name
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = var.labels
}

resource "stackit_authorization_folder_role_assignment" "this" {
  for_each = var.members

  resource_id = stackit_resourcemanager_folder.this.folder_id
  role        = each.value
  subject     = each.key
}