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

output "management_bucket_name_tfstate" {
  description = "The name of the Management tfstate object storage bucket."
  value       = module.management.bucket_name_tfstate
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

output "connectivity_vpn_gateway_id" {
  description = "The ID of the hub VPN gateway."
  value       = try(module.connectivity[0].vpn_gateway_id, null)
}

output "connectivity_vpn_public_ips" {
  description = "Public IPs of the hub VPN gateway tunnels. Configure the remote peer against these."
  value       = try(module.connectivity[0].vpn_public_ips, {})
}

output "connectivity_vpn_internal_next_hop_ips" {
  description = "Network area side IPs of the hub VPN gateway tunnels."
  value       = try(module.connectivity[0].vpn_internal_next_hop_ips, {})
}

output "firewall_admin_url" {
  description = "Where to reach the OPNsense web GUI. Only reachable from inside the network area once the policy blocks the WAN."
  value       = try(var.connectivity.firewall, null) != null ? local.firewall_endpoint : null
}

output "connectivity_vpn_connection_ids" {
  description = "Map of hub VPN connection keys to their connection IDs."
  value       = try(module.connectivity[0].vpn_connection_ids, {})
}

output "platform_kubernetes_projects" {
  description = "Map of platform Kubernetes projects and cluster metadata per key."
  value = {
    for k, v in module.platform_kubernetes : k => {
      project_id                = v.project_id
      project_name              = v.project_name
      ske_cluster_name          = v.ske_cluster_name
      ske_cluster_region        = v.ske_cluster_region
      observability_instance_id = v.observability_instance_id
      dns_extension_zones       = v.dns_extension_zones
    }
  }
}

output "sandbox_projects" {
  description = "The created sandbox projects."
  value       = length(module.sandboxes) > 0 ? module.sandboxes[0].projects : {}
}

output "landing_zone_projects" {
  description = "Map of landing zone project IDs."
  value = {
    for k, v in module.landing_zone : k => {
      project_id                     = v.project_id
      project_name                   = v.project_name
      dns_zone_name                  = v.dns_zone_dns_name
      secretsmanager_instance_id     = v.secretsmanager_instance_id
      observability_instance_id      = v.observability_instance_id
      observability_grafana_url      = v.observability_grafana_url
      observability_metrics_push_url = v.observability_metrics_push_url
      landing_zone_type              = v.landing_zone_type
      connected_network_area_id      = v.connected_network_area_id == null ? "" : v.connected_network_area_id
    }
  }
}

output "landing_zone_namespace_demo_samples" {
  description = "Demo sample references for namespace services."
  value       = nonsensitive(module.namespace_service_demo.samples)
}
