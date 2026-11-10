mock_provider "stackit" {
  mock_resource "stackit_dns_zone" {
    defaults = { zone_id = "00000000-0000-4000-8000-000000000008" }
  }
}
mock_provider "cloudfoundry" {
  mock_resource "cloudfoundry_service_credential_binding" {
    defaults = { credential_binding = "{\"username\":\"space-account\",\"password\":\"test-only\"}" }
  }
  mock_resource "cloudfoundry_space" {
    defaults = { id = "00000000-0000-4000-8000-000000000005" }
  }
}
mock_provider "cloudfoundry" {
  mock_resource "cloudfoundry_service_credential_binding" {
    defaults = { credential_binding = "{\"username\":\"space-account\",\"password\":\"test-only\"}" }
  }
  alias = "runners"
  mock_resource "cloudfoundry_space" {
    defaults = { id = "00000000-0000-4000-8000-000000000007" }
  }
}
variables {
  runner_cf_org_id     = "00000000-0000-4000-8000-000000000006"
  runner_cf_username   = "runner@example.invalid"
  runner_cf_password   = "runner-test-only"
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
    condition     = cloudfoundry_space.plan_runners.org != cloudfoundry_space.configurator.org && cloudfoundry_space.plan_runners.allow_ssh == false
    error_message = "Plan runners must use a separate organisation without SSH."
  }
  assert {
    condition     = stackit_postgresflex_user.application.roles == toset(["login"])
    error_message = "Runtime must not receive database administration roles."
  }
  assert {
    condition     = stackit_secretsmanager_user.application.write_enabled == true
    error_message = "Runtime needs write access to store and delete user session tokens."
  }
  assert {
    condition     = cloudfoundry_space.configurator.allow_ssh == false && cloudfoundry_space_role.deployer.type == "space_developer" && cloudfoundry_org_role.deployer_member.type == "organization_user"
    error_message = "Space deployment permissions must be explicit."
  }
}

run "production_scoped_deployers_and_domain" {
  command = plan
  variables {
    production        = true
    public_domain     = "app.landing-zone.runs.onstackit.cloud"
    dns_zone          = "landing-zone.runs.onstackit.cloud"
    dns_contact_email = "owner@example.com"
  }
  assert {
    condition     = cloudfoundry_service_instance.release[0].service_plan_name == "space-deployer" && cloudfoundry_service_instance.dispatcher[0].service_plan_name == "space-deployer" && cloudfoundry_service_instance.release[0].space != cloudfoundry_service_instance.dispatcher[0].space
    error_message = "Production release and dispatch must have separate space-scoped identities."
  }
  assert {
    condition     = stackit_dns_record_set.application[0].type == "CNAME" && cloudfoundry_domain.application[0].org == var.cf_org_id
    error_message = "Production must map the owned application domain to its application organization."
  }
}
run "reject_unreviewed_production_domain" {
  command = plan
  variables {
    production        = true
    public_domain     = "wrong.example.com"
    dns_zone          = "landing-zone.runs.onstackit.cloud"
    dns_contact_email = "owner@example.com"
  }
  expect_failures = [stackit_dns_zone.application]
}
