output "cf_runtime" {
  description = "Sensitive credentials for the later CF runtime root; do not emit into logs."
  sensitive   = true
  value = {
    api_url  = data.stackit_scf_platform.configurator.api_url
    org_id   = stackit_scf_organization.configurator.org_id
    username = stackit_scf_organization_manager.configurator.username
    password = stackit_scf_organization_manager.configurator.password
  }
}

output "service_ids" {
  description = "Platform resources for subsequent runtime configuration; not customer deployments."
  value = {
    database_instance_id = stackit_postgresflex_instance.configurator.instance_id
    secrets_instance_id  = stackit_secretsmanager_instance.configurator.instance_id
    artifacts_bucket     = stackit_objectstorage_bucket.artifacts.name
  }
}

output "model_serving_token" {
  description = "Backend-only inference token for the later CF binding; never include in the frontend."
  sensitive   = true
  value       = stackit_modelserving_token.configurator.token
}
