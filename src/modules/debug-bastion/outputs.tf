output "enabled" {
  description = "Whether bastion resources are enabled."
  value       = var.enabled
}

output "server_id" {
  description = "Bastion server ID when enabled."
  value       = var.enabled ? stackit_server.this[0].server_id : null
}

output "network_interface_id" {
  description = "Bastion network interface ID when enabled."
  value       = var.enabled ? stackit_network_interface.this[0].network_interface_id : null
}

output "public_ip" {
  description = "Bastion public IP when enabled and assign_public_ip=true."
  value       = var.enabled && var.assign_public_ip ? stackit_public_ip.this[0].ip : null
}

output "ssh_user" {
  description = "Default SSH user for bastion access."
  value       = var.enabled ? "ubuntu" : null
}

output "ssh_command" {
  description = "Ready-to-use SSH command when public IP is assigned."
  value       = var.enabled && var.assign_public_ip ? "ssh ubuntu@${stackit_public_ip.this[0].ip}" : null
}
