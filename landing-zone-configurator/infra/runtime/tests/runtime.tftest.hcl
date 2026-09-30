mock_provider "stackit" {}
mock_provider "cloudfoundry" {
  mock_resource "cloudfoundry_space" {
    defaults = { id = "00000000-0000-4000-8000-000000000005" }
  }
}
variables {
  project_id           = "00000000-0000-4000-8000-000000000001"
  region               = "eu01"
  cf_org_id            = "00000000-0000-4000-8000-000000000002"
  cf_username          = "deployer@example.invalid"
  database_instance_id = "00000000-0000-4000-8000-000000000003"
  secrets_instance_id  = "00000000-0000-4000-8000-000000000004"
  model_serving_token  = "test-only-not-a-real-token"
}
run "isolated_runtime_identities" {
  command = plan
  assert {
    condition     = stackit_postgresflex_user.application.roles == toset(["login"])
    error_message = "Runtime must not receive database administration roles."
  }
  assert {
    condition     = stackit_secretsmanager_user.application.write_enabled == false
    error_message = "Connectivity stage requires read-only Secrets access."
  }
  assert {
    condition     = cloudfoundry_space.configurator.allow_ssh == false && cloudfoundry_space_role.deployer.type == "space_developer"
    error_message = "Space deployment permissions must be explicit."
  }
}
