output "firewall_public_ip" {
  description = "The public IP address of the pfSense firewall WAN interface."
  value       = stackit_public_ip.wan-ip.ip
}

output "firewall_next_hop_ip" {
  description = "The IP address to be used as next hop for the default route in the landing zones (pfSense WAN IP)."
  value       = stackit_network_interface.lan.ipv4
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
