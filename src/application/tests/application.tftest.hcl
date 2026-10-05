run "compiled_project_roles" {
  command = plan

  variables {
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
      custom_roles = [{
        name        = "application-reader"
        description = "Read only"
        permissions = ["project.read"]
      }]
      role_assignments = [{
        role    = "application-reader"
        subject = "owner@example.com"
      }]
    }
  }

  assert {
    condition     = module.application.project_role_counts.custom_roles == 1 && module.application.project_role_counts.role_assignments == 1
    error_message = "Compiled role definitions and verified-context assignments must reach the project resources."
  }
}

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
    condition     = local.naming_pattern == "app-${var.application.instance_id}" && !contains(keys(local.application_labels), "env")
    error_message = "Legacy inputs without env must retain their resource prefix and labels."
  }
  assert {
    condition     = module.application.connected_network_area_id == null && module.application.observability_instance_id == null
    error_message = "Public project must not create a network area or enabled Observability instance."
  }
  assert {
    condition     = module.application.project_network == null
    error_message = "Legacy public applications must not gain a network implicitly."
  }
}

run "public_local_network" {
  command = plan

  variables {
    application = {
      tenant_id              = "11111111-2222-4333-8444-555555555555"
      instance_id            = "11111111-2222-4333-8444-555555555555"
      platform_revision      = "11111111-2222-4333-8444-555555555555"
      template_id            = "vm-network"
      template_version       = 1
      name                   = "VM network fixture"
      owner_email            = "owner@example.com"
      target_key             = "public"
      network_enabled        = true
      network_prefix_length  = 24
      secretsmanager_enabled = false
      observability          = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [] }
    }
  }

  assert {
    condition     = module.application.project_network != null && module.application.project_network.name == "app-${var.application.instance_id}-local" && !module.application.project_network.routed && module.application.project_network.ipv4_prefix_length == 24
    error_message = "The compiled public template must create a local network with the requested prefix."
  }

  assert {
    condition     = module.application.connected_network_area_id == null && module.application.landing_zone_type == "public"
    error_message = "Local project networking must not require or attach an SNA."
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

run "new_stage_resource_names" {
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
    }, { env = "prod" })
  }
  assert {
    condition     = local.naming_pattern == "app-${var.application.instance_id}-prod" && local.application_labels.env == "prod" && module.application.project_name == "Application fixture"
    error_message = "Stage must affect the resource prefix and label, while keeping the requested display name."
  }
}

run "invalid_stage_rejected" {
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
    }, { env = "Prod/../../invalid" })
  }
  expect_failures = [var.application]
}

run "literal_observability_acl_preserved" {
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
    }, { observability = { enabled = true, plan_name = "Observability-Starter-EU01", acl = ["203.0.113.8/32"], access_source = "explicit-cidrs" } })
  }
  assert {
    condition     = length(var.application.observability.acl) == 1 && var.application.observability.acl[0] == "203.0.113.8/32" && var.application.observability.access_source == "explicit-cidrs"
    error_message = "Explicit ACL input must remain literal and must not be replaced by network values."
  }
}

run "symbolic_project_network_corporate_blocked" {
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
    }, { target_key = "corporate", observability = { enabled = true, plan_name = "Observability-Starter-EU01", acl = [], access_source = "project-network" } })
  }
  expect_failures = [terraform_data.contract]
}

run "symbolic_project_network_public_blocked" {
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
    }, { observability = { enabled = true, plan_name = "Observability-Starter-EU01", acl = [], access_source = "project-network" } })
  }
  expect_failures = [terraform_data.contract]
}

run "invalid_observability_source_rejected" {
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
    }, { observability = { enabled = true, plan_name = "Observability-Starter-EU01", acl = [], access_source = "unknown" } })
  }
  expect_failures = [var.application]
}

run "mixed_binding_and_literal_acl_rejected" {
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
    }, { observability = { enabled = true, plan_name = "Observability-Starter-EU01", acl = ["203.0.113.8/32"], access_source = "project-network" } })
  }
  expect_failures = [var.application]
}

run "disabled_source_binding_rejected" {
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
    }, { observability = { enabled = false, plan_name = "Observability-Starter-EU01", acl = [], access_source = "project-network" } })
  }
  expect_failures = [var.application]
}
