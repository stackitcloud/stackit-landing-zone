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

output "service_account_email" {
  description = "The email of the created service account."
  value       = stackit_service_account.automation.email
}

output "secretsmanager_username" {
  description = "The username of the default Secrets Manager user."
  value       = stackit_secretsmanager_user.default.username
}

output "secretsmanager_password" {
  description = "The password of the default Secrets Manager user."
  value       = stackit_secretsmanager_user.default.password
  sensitive   = true
}