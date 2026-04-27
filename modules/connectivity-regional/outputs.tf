output "firewall_public_ip" {
  description = "The public IP address of the pfSense firewall WAN interface."
  value       = var.firewall_enabled ? stackit_public_ip.wan-ip[0].ip : null
}

output "firewall_next_hop_ip" {
  description = "The IP address to be used as next hop for the default route in the landing zones (pfSense WAN IP)."
  value       = var.firewall_enabled ? stackit_network_interface.lan[0].ipv4 : null
}

output "network_area_id" {
  description = "The ID of the created network area."
  value       = stackit_network_area.this.network_area_id
}
