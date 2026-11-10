output "project" {
  description = "Operator project identity for the isolated environment bootstrap."
  value = {
    id           = stackit_resourcemanager_project.configurator.project_id
    container_id = stackit_resourcemanager_project.configurator.container_id
    name         = stackit_resourcemanager_project.configurator.name
  }
}

output "provisioning_key" {
  description = "Project-scoped provisioning key; publish only to production infrastructure environments."
  value       = stackit_service_account_key.provisioning.json
  sensitive   = true
}
