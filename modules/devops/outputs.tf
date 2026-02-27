output "project_id" {
  description = "The project ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.project.project_id
}

output "project_container_id" {
  description = "The container ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.project.container_id
}

output "project_name" {
  description = "The name of the created STACKIT project."
  value       = stackit_resourcemanager_project.project.name
}
