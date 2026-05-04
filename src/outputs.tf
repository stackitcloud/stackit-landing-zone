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

output "connectivity_network_area_id" {
  description = "The network area ID created by the regional module."
  value       = try(module.connectivity[0].network_area_id, null)
}

output "connectivity_project_id" {
  description = "The project ID of the connectivity project."
  value       = try(module.connectivity[0].project_id, null)
}

output "connectivity_firewall_public_ip" {
  description = "The public IP of the firewall."
  value       = try(module.connectivity[0].firewall_public_ip, null)
}

output "sandbox_projects" {
  description = "The created sandbox projects."
  value       = length(module.sandboxes) > 0 ? module.sandboxes[0].projects : {}
}

output "landing_zone_projects" {
  description = "Map of landing zone project IDs."
  value = {
    for k, v in module.landing_zone : k => {
      project_id    = v.project_id
      project_name  = v.project_name
      dns_zone_name = v.dns_zone_dns_name
      landing_zone_type = v.landing_zone_type
      connected_network_area_id = v.connected_network_area_id == null ? "" : v.connected_network_area_id
    }
  }
}
