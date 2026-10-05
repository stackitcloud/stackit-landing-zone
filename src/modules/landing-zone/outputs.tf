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

output "project_network" {
  description = "Non-secret reference to the managed project network, or null when no network is created."
  value = try({
    network_id         = stackit_network.this[0].network_id
    name               = stackit_network.this[0].name
    routed             = stackit_network.this[0].routed
    ipv4_prefix_length = stackit_network.this[0].ipv4_prefix_length
  }, null)
}

output "project_role_counts" {
  description = "Counts of custom roles and explicit role assignments managed by this project module."
  value = {
    custom_roles     = length(stackit_authorization_project_custom_role.this)
    role_assignments = length(stackit_authorization_project_role_assignment.this)
  }
}

output "dns_zone_dns_name" {
  description = "The DNS name of the landing zone's child DNS zone."
  value       = try(stackit_dns_zone.this[0].dns_name, null)
}

output "dns_zone_id" {
  description = "The ID of the landing zone's child DNS zone."
  value       = try(stackit_dns_zone.this[0].zone_id, null)
}

output "connected_network_area_id" {
  description = "The ID of the connected network area."
  value       = try(var.network_area_id, null)
}

output "landing_zone_type" {
  description = "The type of the landing zone, either 'corporate' or 'public'."
  value       = var.corporate ? "corporate" : "public"
}

output "secretsmanager_instance_id" {
  description = "The ID of the landing zone Secrets Manager instance."
  value       = try(stackit_secretsmanager_instance.this[0].instance_id, null)
}

output "observability_instance_id" {
  description = "The optional observability instance ID in the landing zone project."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].instance_id : null
}

output "observability_grafana_url" {
  description = "The Grafana URL of the optional landing zone observability instance."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].grafana_url : null
}

output "observability_metrics_push_url" {
  description = "The Prometheus remote-write URL of the optional landing zone observability instance."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].metrics_push_url : null
}

output "observability_grafana_admin_user" {
  description = "The Grafana admin username of the optional landing zone observability instance."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].grafana_initial_admin_user : null
}

output "observability_grafana_admin_password" {
  description = "The Grafana admin password of the optional landing zone observability instance."
  sensitive   = true
  value       = var.observability.enabled ? stackit_observability_instance.this[0].grafana_initial_admin_password : null
}
