#############
## OUTPUTS ##
#############

output "governance_folder_ids" {
  description = "Map of governance folder names to their container IDs."
  value       = module.governance.folder_container_ids
}

output "devops_project_id" {
  description = "The project ID of the DevOps project."
  value       = length(module.devops) > 0 ? module.devops[0].project_id : null
}

output "management_project_id" {
  description = "The project ID of the Management project."
  value       = module.management.project_id
}

output "sandbox_projects" {
  description = "The created sandbox projects."
  value       = length(module.sandboxes) > 0 ? module.sandboxes[0].projects : {}
}

output "landing_zone_projects" {
  description = "Map of landing zone project IDs."
  value = {
    for k, v in module.landing_zone : k => {
      project_id   = v.project_id
      project_name = v.project_name
    }
  }
}