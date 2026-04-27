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

output "dns_zone_ids" {
  description = "Map of DNS zone keys to their zone IDs"
  value       = { for k, z in stackit_dns_zone.this : k => z.zone_id }
}