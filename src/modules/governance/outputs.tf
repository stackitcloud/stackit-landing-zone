output "folder_container_ids" {
  description = "Map of all folder keys to their container IDs for easy reference"
  value = merge(
    { root = var.organization_id },
    { for k, f in stackit_resourcemanager_folder.this : k => f.container_id }
  )
}

output "custom_role_ids" {
  description = "Map of custom role names to their role IDs"
  value       = { for k, r in stackit_authorization_project_custom_role.this : k => r.role_id }
}

output "organization_role_assignments" {
  description = "Map of organization-level role assignment subjects grouped by role"
  value = {
    owners   = { for k, r in stackit_authorization_organization_role_assignment.owner : k => r.subject }
    auditors = { for k, r in stackit_authorization_organization_role_assignment.auditor : k => r.subject }
  }
}