output "dns_zone_dns_names" {
  description = "Map of DNS zone keys to their DNS names"
  value       = { for k, z in stackit_dns_zone.this : k => z.dns_name }
}

output "dns_zone_ids" {
  description = "Map of DNS zone keys to their zone IDs"
  value       = { for k, z in stackit_dns_zone.this : k => z.zone_id }
}

output "firewall_next_hop_ip" {
  description = "The IP address to be used as next hop for the default route in the landing zones. The CARP LAN VIP under HA, otherwise the firewall LAN IP."
  value       = local.firewall_ha_enabled ? local.firewall_lan_vip : (local.firewall_enabled ? stackit_network_interface.lan[0].ipv4 : null)
}

output "firewall_public_ip" {
  description = "The public IP address of the firewall WAN interface (primary node)."
  value       = local.firewall_enabled ? stackit_public_ip.wan-ip[0].ip : null
}

output "firewall_backup_public_ip" {
  description = "The public IP address of the backup firewall's WAN interface. Null without HA."
  value       = local.firewall_ha_enabled ? stackit_public_ip.wan-ip_backup[0].ip : null
}

output "firewall_cluster_lan_ips" {
  description = "LAN addresses of the firewall HA pair, for the fw_cluster alias in the policy. Empty without HA."
  value       = local.firewall_ha_enabled ? [local.firewall_lan_ip, local.firewall_backup_lan_ip] : []
}

output "network_area_id" {
  description = "The ID of the created network area."
  value       = stackit_network_area.this.network_area_id
}

output "network_area_nameservers" {
  description = "Resolvers configured as the network area default, either from network_area.default_nameservers or the STACKIT resolvers of the region."
  value       = local.network_area_nameservers
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

output "vpn_connection_ids" {
  description = "Map of VPN connection keys to their connection IDs."
  value       = { for k, c in stackit_vpn_connection.this : k => c.connection_id }
}

output "vpn_gateway_id" {
  description = "The ID of the VPN gateway in the hub."
  value       = try(stackit_vpn_gateway.this[0].gateway_id, null)
}

output "vpn_internal_next_hop_ips" {
  description = "Map of VPN tunnel names to their network area side IP. Ping targets to verify a tunnel carries traffic into the SNA."
  value       = try({ for t in data.stackit_vpn_gateway_status.this[0].tunnels : t.name => t.internal_next_hop_ip }, {})
}

output "vpn_public_ips" {
  description = "Map of VPN tunnel names to their public IP. These are the addresses the remote peer has to be configured against."
  value       = try({ for t in data.stackit_vpn_gateway_status.this[0].tunnels : t.name => t.public_ip }, {})
}
