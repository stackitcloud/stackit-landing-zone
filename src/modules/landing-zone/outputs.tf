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

output "dns_zone_dns_name" {
  description = "The DNS name of the landing zone's child DNS zone."
  value       = var.dns_zone_name != null ? stackit_dns_zone.this[0].dns_name : null
}

output "dns_zone_id" {
  description = "The ID of the landing zone's child DNS zone."
  value       = var.dns_zone_name != null ? stackit_dns_zone.this[0].zone_id : null
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
  value       = stackit_secretsmanager_instance.this.instance_id
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