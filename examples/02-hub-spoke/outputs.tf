#############
## OUTPUTS ##
#############

output "governance_folder_ids" {
  description = "Map of governance folder names to their container IDs."
  value       = module.governance.folder_container_ids
}

output "devops_project_id" {
  description = "The project ID of the DevOps project."
  value       = module.devops.project_id
}

output "management_project_id" {
  description = "The project ID of the Management project."
  value       = module.management.project_id
}

output "connectivity_global_network_area_ids" {
  description = "Map of network area names to their IDs."
  value       = module.connectivity_global.network_area_ids
}

output "connectivity_regional_project_id" {
  description = "The project ID of the regional connectivity project."
  value       = module.connectivity_regional.project_id
}

output "connectivity_regional_firewall_public_ip" {
  description = "The public IP of the firewall."
  value       = module.connectivity_regional.firewall_public_ip
}

output "sandbox_projects" {
  description = "The created sandbox projects."
  value       = module.sandboxes.projects
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
