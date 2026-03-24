output "pfsense_public_ip" {
  description = "The public IP address of the pfSense firewall WAN interface."
  value       = stackit_public_ip.wan.ip
}

output "pfsense_wan_ip" {
  description = "The internal network area IP of the pfSense WAN interface (used as next hop in routes)."
  value       = stackit_network_interface.wan.ipv4
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
