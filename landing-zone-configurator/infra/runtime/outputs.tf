output "space" {
  description = "Application CF space identity."
  value = {
    id   = cloudfoundry_space.configurator.id
    name = cloudfoundry_space.configurator.name
  }
}
output "app_environment" {
  description = "Backend-only runtime credentials; never print or include in frontend assets."
  sensitive   = true
  value = {
    LZC_DATABASE_HOST       = data.stackit_postgresflex_instance.configurator.connection_info.write.host
    LZC_DATABASE_PORT       = tostring(data.stackit_postgresflex_instance.configurator.connection_info.write.port)
    LZC_DATABASE_NAME       = "configurator"
    LZC_DATABASE_USER       = stackit_postgresflex_user.application.username
    LZC_DATABASE_PASSWORD   = stackit_postgresflex_user.application.password
    LZC_SECRETS_ADDRESS     = "https://prod.sm.${var.region}.stackit.cloud"
    LZC_SECRETS_INSTANCE_ID = var.secrets_instance_id
    LZC_SECRETS_USERNAME    = stackit_secretsmanager_user.application.username
    LZC_SECRETS_PASSWORD    = stackit_secretsmanager_user.application.password
    LZC_MODEL_SERVING_TOKEN = var.model_serving_token
  }
}

output "release_credentials" {
  description = "Space-scoped application deployer; never publish organization-manager credentials to release."
  value       = var.production ? jsondecode(cloudfoundry_service_credential_binding.release[0].credential_binding) : null
  sensitive   = true
}

output "dispatcher_credentials" {
  description = "Space-scoped Runner dispatcher; has no access to application bindings."
  value       = var.production ? jsondecode(cloudfoundry_service_credential_binding.dispatcher[0].credential_binding) : null
  sensitive   = true
}

output "public_endpoint" {
  description = "DNS and private CF domain; TLS issuance is checked independently after route mapping."
  value = var.production ? {
    origin = "https://${var.public_domain}"
    zone   = stackit_dns_zone.application[0].dns_name
    route  = cloudfoundry_domain.application[0].name
  } : null
}
