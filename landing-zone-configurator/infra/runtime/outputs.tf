output "space" {
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
