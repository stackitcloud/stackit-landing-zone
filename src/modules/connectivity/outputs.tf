output "dns_zone_dns_names" {
  description = "Map of DNS zone keys to their DNS names"
  value       = { for key, zone in stackit_dns_zone.this : key => zone.dns_name }
}

output "dns_zone_ids" {
  description = "Map of DNS zone keys to their zone IDs"
  value       = { for key, zone in stackit_dns_zone.this : key => zone.zone_id }
}

output "firewall_next_hop_ip" {
  description = "Map of network area keys to the default-route next hop. The CARP LAN VIP under HA, otherwise the firewall LAN IP."
  value       = { for key, firewall in local.firewalls : key => contains(keys(local.ha_firewalls), key) ? local.firewall_lan_vips[key] : stackit_network_interface.lan[key].ipv4 }
}

output "firewall_public_ip" {
  description = "Map of network area keys to primary firewall WAN public IPs."
  value       = { for key, address in stackit_public_ip.wan-ip : key => address.ip }
}

output "firewall_backup_public_ip" {
  description = "Map of network area keys to backup firewall WAN public IPs. Empty without HA."
  value       = { for key, address in stackit_public_ip.wan-ip_backup : key => address.ip }
}

output "firewall_cluster_lan_ips" {
  description = "Map of network area keys to LAN addresses of firewall HA pairs. Empty without HA."
  value       = { for key, firewall in local.ha_firewalls : key => [local.firewall_lan_ips[key], local.firewall_backup_lan_ips[key]] }
}

output "network_area_id" {
  description = "The ID of the created network area."
  value       = { for idx, na in var.network_areas : idx => stackit_network_area.this[idx].network_area_id }
}

output "network_area_nameservers" {
  description = "Resolvers configured as the network area default, either from network_area.default_nameservers or the STACKIT resolvers of the region."
  value       = { for idx, na in var.network_areas : idx => local.network_area_nameservers[idx] }
}

output "project_container_id" {
  description = "The container ID of the created STACKIT project."
  value       = { for idx, na in var.network_areas : idx => stackit_resourcemanager_project.this[idx].container_id }
}

output "project_id" {
  description = "The project ID of the created STACKIT project."
  value       = { for idx, na in var.network_areas : idx => stackit_resourcemanager_project.this[idx].project_id }
}

output "project_name" {
  description = "The name of the created STACKIT project."
  value       = { for idx, na in var.network_areas : idx => stackit_resourcemanager_project.this[idx].name }
}

output "vpn_connection_ids" {
  description = "Map of network-area/connection keys to their VPN connection IDs."
  value       = { for key, connection in stackit_vpn_connection.this : key => connection.connection_id }
}

output "vpn_gateway_id" {
  description = "Map of network area keys to VPN gateway IDs."
  value       = { for key, gateway in stackit_vpn_gateway.this : key => gateway.gateway_id }
}

output "vpn_internal_next_hop_ips" {
  description = "Map of VPN tunnel names to their network area side IP. Ping targets to verify a tunnel carries traffic into the SNA."
  value       = { for key, status in data.stackit_vpn_gateway_status.this : key => { for tunnel in status.tunnels : tunnel.name => tunnel.internal_next_hop_ip } }
}

output "vpn_public_ips" {
  description = "Map of VPN tunnel names to their public IP. These are the addresses the remote peer has to be configured against."
  value       = { for key, status in data.stackit_vpn_gateway_status.this : key => { for tunnel in status.tunnels : tunnel.name => tunnel.public_ip } }
}
