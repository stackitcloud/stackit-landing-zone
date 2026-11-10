mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_project" {
    defaults = { project_id = "00000000-0000-4000-8000-000000000001" }
  }
  mock_resource "stackit_service_account" {
    defaults = { email = "production@example.com" }
  }
}

variables {
  operator_service_account_email = "operator@example.invalid"
  owner_email                    = "owner@example.invalid"
  parent_container_id            = "00000000-0000-4000-8000-000000000001"
  project_name                   = "Landing Zone Configurator - Prod"
}

run "operator_project_boundary" {
  command = plan
  assert {
    condition     = stackit_resourcemanager_project.configurator.name == "Landing Zone Configurator - Prod"
    error_message = "Use the selected operator project name."
  }
}

run "production_project_scoped_identity" {
  command = plan
  assert {
    condition     = stackit_authorization_project_role_assignment.provisioning.resource_id == stackit_resourcemanager_project.configurator.project_id && stackit_authorization_project_role_assignment.provisioning.role == "owner" && stackit_service_account_key.provisioning.ttl_days == 90
    error_message = "Provisioning identity must remain limited to its operator project with a bounded key lifetime."
  }
}

run "reject_ambiguous_project" {
  command = plan
  variables { project_name = "default" }
  expect_failures = [var.project_name]
}
