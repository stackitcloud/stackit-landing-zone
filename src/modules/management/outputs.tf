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

output "bucket_name_tfstate" {
  description = "The name of the tfstate object storage bucket."
  value       = stackit_objectstorage_bucket.tfstate.name
}
output "secretsmanager_instance_id" {
  description = "The ID of the Secrets Manager instance, usable as the vault mount."
  value       = stackit_secretsmanager_instance.this.instance_id
}

output "audit_logs_instance_id" {
  description = "The ID of the Logs instance receiving audit logs."
  value       = try(stackit_logs_instance.audit[0].instance_id, null)
}

output "audit_logs_datasource_url" {
  description = "Datasource URL of the audit Logs instance, usable as a Grafana datasource."
  value       = try(stackit_logs_instance.audit[0].datasource_url, null)
}

output "audit_telemetry_router_id" {
  description = "The ID of the Telemetry Router collecting audit logs."
  value       = try(stackit_telemetryrouter_instance.audit[0].instance_id, null)
}

output "audit_logs_bucket_name" {
  description = "The name of the object storage bucket archiving audit logs."
  value       = stackit_objectstorage_bucket.audit_logs.name
}
