output "dns_zone_dns_names" {
  description = "Map of DNS zone keys to their DNS names"
  value       = { for k, z in stackit_dns_zone.this : k => z.dns_name }
}

output "dns_zone_ids" {
  description = "Map of DNS zone keys to their zone IDs"
  value       = { for k, z in stackit_dns_zone.this : k => z.zone_id }
}

output "firewall_next_hop_ip" {
  description = "The IP address to be used as next hop for the default route in the landing zones (firewall LAN IP)."
  value       = local.firewall_enabled ? stackit_network_interface.lan[0].ipv4 : null
}

output "firewall_public_ip" {
  description = "The public IP address of the firewall WAN interface."
  value       = local.firewall_enabled ? stackit_public_ip.wan-ip[0].ip : null
}

output "network_area_id" {
  description = "The ID of the created network area."
  value       = stackit_network_area.this.network_area_id
}

output "project_container_id" {
  description = "The container ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.container_id
}

output "project_id" {
  description = "The project ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.project_id
}

output "project_name" {
  description = "The name of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.name
}
