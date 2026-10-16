mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_folder" {
    defaults = {
      folder_id    = "33333333-3333-4333-8333-333333333333"
      container_id = "44444444-4444-4444-8444-444444444444"
    }
  }
}
mock_provider "time" {}

variables {
  owner_email           = "technical-owner@stackit.cloud"
  organization_id       = "11111111-1111-4111-8111-111111111111"
  organization_owners   = ["org-owner@stackit.cloud"]
  organization_auditors = ["org-auditor@stackit.cloud"]
  rm_folders = {
    platform = {
      name          = "Platform"
      owner_emails  = ["org-owner@stackit.cloud", "folder-owner@stackit.cloud"]
      reader_emails = ["org-owner@stackit.cloud", "folder-reader@stackit.cloud"]
    }
  }
}

run "organization_parent_and_role_assignments" {
  command = plan
  assert {
    condition     = stackit_resourcemanager_folder.this["platform"].parent_container_id == var.organization_id && stackit_resourcemanager_folder.this["platform"].name == "Platform" && stackit_resourcemanager_folder.this["platform"].owner_email == var.owner_email
    error_message = "Folder parent/name/technical owner must retain the governance contract."
  }
  assert {
    condition     = stackit_authorization_organization_role_assignment.owner["org-owner@stackit.cloud"].role == "owner" && stackit_authorization_organization_role_assignment.owner["org-owner@stackit.cloud"].subject == "org-owner@stackit.cloud" && stackit_authorization_organization_role_assignment.owner["org-owner@stackit.cloud"].resource_id == var.organization_id
    error_message = "Organization owners must be planned for the selected organization."
  }
  assert {
    condition     = stackit_authorization_organization_role_assignment.auditor["org-auditor@stackit.cloud"].role == "organization.auditor" && stackit_authorization_organization_role_assignment.auditor["org-auditor@stackit.cloud"].subject == "org-auditor@stackit.cloud" && stackit_authorization_organization_role_assignment.auditor["org-auditor@stackit.cloud"].resource_id == var.organization_id
    error_message = "Organization auditors must retain the actual Accelerator role name."
  }
  assert {
    condition     = length(stackit_authorization_folder_role_assignment.owners) == 1 && stackit_authorization_folder_role_assignment.owners["platform:folder-owner@stackit.cloud"].role == "owner" && stackit_authorization_folder_role_assignment.owners["platform:folder-owner@stackit.cloud"].subject == "folder-owner@stackit.cloud" && stackit_authorization_folder_role_assignment.owners["platform:folder-owner@stackit.cloud"].resource_id == stackit_resourcemanager_folder.this["platform"].folder_id
    error_message = "Folder owners must be retained and organization-owner duplicates omitted."
  }
  assert {
    condition     = length(stackit_authorization_folder_role_assignment.readers) == 1 && stackit_authorization_folder_role_assignment.readers["platform:folder-reader@stackit.cloud"].role == "auditor" && stackit_authorization_folder_role_assignment.readers["platform:folder-reader@stackit.cloud"].subject == "folder-reader@stackit.cloud" && stackit_authorization_folder_role_assignment.readers["platform:folder-reader@stackit.cloud"].resource_id == stackit_resourcemanager_folder.this["platform"].folder_id
    error_message = "Folder readers must use auditor, not organization.auditor, with duplicates omitted."
  }
}

run "explicit_parent_null_description" {
  command = plan
  variables {
    rm_folder_parent_id = "22222222-2222-4222-8222-222222222222"
    rm_folders = {
      platform = { name = "Child Platform", owner_emails = [], reader_emails = [], description = null }
    }
  }
  assert {
    condition     = stackit_resourcemanager_folder.this["platform"].parent_container_id == var.rm_folder_parent_id && stackit_resourcemanager_folder.this["platform"].name == "Child Platform" && stackit_resourcemanager_folder.this["platform"].owner_email == var.owner_email && length(stackit_authorization_folder_role_assignment.owners) == 0 && length(stackit_authorization_folder_role_assignment.readers) == 0
    error_message = "Explicit folder parent is supported; null description is ignored by the existing module type."
  }
}

run "empty_description" {
  command = plan
  variables {
    rm_folders = {
      platform = { name = "Platform", owner_emails = [], reader_emails = [], description = "" }
    }
  }
  assert {
    condition     = stackit_resourcemanager_folder.this["platform"].parent_container_id == var.organization_id && stackit_resourcemanager_folder.this["platform"].owner_email == var.owner_email && length(stackit_authorization_folder_role_assignment.owners) == 0 && length(stackit_authorization_folder_role_assignment.readers) == 0
    error_message = "Empty description must remain harmless; populated descriptions remain blocked by the Configurator (#82)."
  }
}
