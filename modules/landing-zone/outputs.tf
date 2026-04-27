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