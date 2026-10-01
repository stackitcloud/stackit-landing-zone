mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_project" {
    defaults = {
      project_id   = "44444444-2222-4333-8444-555555555555"
      container_id = "55555555-2222-4333-8444-555555555555"
    }
  }
  mock_resource "stackit_objectstorage_credentials_group" {
    defaults = { credentials_group_id = "66666666-2222-4333-8444-555555555555" }
  }
  mock_resource "stackit_service_account" {
    defaults = { email = "automation@sa.stackit.cloud" }
  }
}
mock_provider "time" {}

variables {
  platform_contract = {
    schema_version  = 1
    tenant_id       = "11111111-2222-4333-8444-555555555555"
    revision        = "11111111-2222-4333-8444-555555555555"
    organization_id = "11111111-2222-4333-8444-555555555555"
    targets = {
      public = {
        folder_id = "11111111-2222-4333-8444-555555555555"
        region    = "eu01"
        corporate = false
      }
      corporate = {
        folder_id       = "22222222-2222-4333-8444-555555555555"
        region          = "eu02"
        corporate       = true
        network_area_id = "33333333-2222-4333-8444-555555555555"
      }
    }
  }
  application = {
    tenant_id              = "11111111-2222-4333-8444-555555555555"
    instance_id            = "11111111-2222-4333-8444-555555555555"
    platform_revision      = "11111111-2222-4333-8444-555555555555"
    template_id            = "project-base"
    template_version       = 1
    name                   = "Application fixture"
    owner_email            = "owner@example.com"
    target_key             = "public"
    secretsmanager_enabled = true
    observability          = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [] }
  }
}

run "public_project" {
  command = plan
  assert {
    condition     = module.application.landing_zone_type == "public" && module.application.project_name == "Application fixture"
    error_message = "Public project must use the compiled instance settings."
  }
  assert {
    condition     = module.application.connected_network_area_id == null && module.application.observability_instance_id == null
    error_message = "Public project must not create a network area or enabled Observability instance."
  }
}
run "corporate_project" {
  command = plan
  variables {
    application = merge({
      tenant_id              = "11111111-2222-4333-8444-555555555555"
      instance_id            = "11111111-2222-4333-8444-555555555555"
      platform_revision      = "11111111-2222-4333-8444-555555555555"
      template_id            = "project-base"
      template_version       = 1
      name                   = "Application fixture"
      owner_email            = "owner@example.com"
      target_key             = "public"
      secretsmanager_enabled = true
      observability          = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [] }
    }, { target_key = "corporate" })
  }
  assert {
    condition     = module.application.connected_network_area_id == "33333333-2222-4333-8444-555555555555" && module.application.landing_zone_type == "corporate"
    error_message = "Corporate project must reference the platform-owned SNA."
  }
}
run "cross_tenant_rejected" {
  command = plan
  variables {
    application = merge({
      tenant_id              = "11111111-2222-4333-8444-555555555555"
      instance_id            = "11111111-2222-4333-8444-555555555555"
      platform_revision      = "11111111-2222-4333-8444-555555555555"
      template_id            = "project-base"
      template_version       = 1
      name                   = "Application fixture"
      owner_email            = "owner@example.com"
      target_key             = "public"
      secretsmanager_enabled = true
      observability          = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [] }
    }, { tenant_id = "22222222-2222-4333-8444-555555555555" })
  }
  expect_failures = [terraform_data.contract]
}
run "stale_contract_rejected" {
  command = plan
  variables {
    application = merge({
      tenant_id              = "11111111-2222-4333-8444-555555555555"
      instance_id            = "11111111-2222-4333-8444-555555555555"
      platform_revision      = "11111111-2222-4333-8444-555555555555"
      template_id            = "project-base"
      template_version       = 1
      name                   = "Application fixture"
      owner_email            = "owner@example.com"
      target_key             = "public"
      secretsmanager_enabled = true
      observability          = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [] }
    }, { platform_revision = "22222222-2222-4333-8444-555555555555" })
  }
  expect_failures = [terraform_data.contract]
}
