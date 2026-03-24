locals {
  folder_owners = merge([
    for folder_key, folder in var.rm_folders : {
      for email in folder.owner_emails :
      "${folder_key}:${email}" => {
        folder_key = folder_key
        subject    = email
      }
      if !contains(var.organization_owners, email) # skip duplicates already covered by org-level role
    }
  ]...)

  folder_readers = merge([
    for folder_key, folder in var.rm_folders : {
      for email in folder.reader_emails :
      "${folder_key}:${email}" => {
        folder_key = folder_key
        subject    = email
      }
      if !contains(var.organization_owners, email) # skip duplicates already covered by org-level role
    }
  ]...)
}

##############################
## RESOURCE MANAGER FOLDERS ##
##############################

resource "stackit_resourcemanager_folder" "this" {
  for_each = var.rm_folders

  name                = each.value.name
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = length(var.labels) > 0 ? var.labels : null # provider bug: empty map becomes null after apply
}

################################
## RM FOLDER ROLE ASSIGNMENTS ##
################################

resource "stackit_authorization_folder_role_assignment" "owners" {
  for_each = local.folder_owners

  resource_id = stackit_resourcemanager_folder.this[each.value.folder_key].folder_id
  role        = "owner"
  subject     = each.value.subject
}

resource "stackit_authorization_folder_role_assignment" "readers" {
  for_each = local.folder_readers

  resource_id = stackit_resourcemanager_folder.this[each.value.folder_key].folder_id
  role        = "auditor"
  subject     = each.value.subject
}