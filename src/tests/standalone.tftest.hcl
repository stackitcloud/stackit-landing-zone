run "cli_platform_only_handoff" {
  command = plan

  variables {
    landing_zones = {}
    sandboxes     = []
  }

  assert {
    condition     = length(module.landing_zone) == 0 && local.resource_labels.landing_zone_accelerator == "true" && !contains(keys(local.resource_labels), "landing_zone_configurator")
    error_message = "CLI platform-only execution must not create application instances or claim Configurator provenance."
  }

  assert {
    condition     = output.platform_contract.schema_version == 1 && output.platform_contract.tenant_id == var.organization_id && output.platform_contract.targets["public-eu01"].corporate == false && output.platform_contract.targets["public-eu01"].network_area_id == null
    error_message = "The CLI handoff must export organization-scoped non-secret public target references."
  }
}

run "regional_platform_handoff" {
  command = plan

  variables {
    landing_zones = {}
    sandboxes     = []
    connectivity_regions = {
      eu01 = {
        network_areas = {
          default = {
            ranges           = ["10.10.0.0/16"]
            transfer_network = "10.10.0.0/24"
          }
        }
      }
      eu02 = {
        network_areas = {
          default = {
            ranges           = ["10.20.0.0/16"]
            transfer_network = "10.20.0.0/24"
          }
        }
      }
    }
  }

  assert {
    condition     = output.platform_contract.targets["corporate-eu01-${substr(sha256("default"), 0, 16)}"].region == "eu01" && output.platform_contract.targets["corporate-eu02-${substr(sha256("default"), 0, 16)}"].region == "eu02"
    error_message = "Regional corporate handoff targets must retain their distinct SNA regions."
  }
}

run "platform_configurator_labels" {
  command = plan

  variables {
    landing_zones = {}
    sandboxes     = []
    labels = {
      customer                  = "retained"
      landing_zone_accelerator  = "false"
      landing_zone_configurator = "true"
    }
  }

  assert {
    condition     = local.resource_labels.landing_zone_accelerator == "true" && local.resource_labels.landing_zone_configurator == "true" && local.resource_labels.customer == "retained"
    error_message = "Configurator provenance must supplement mandatory Accelerator provenance without losing customer labels."
  }
}

run "management_configurator_project_labels" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "tst-pltfm-mgmt-prod"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
    labels = {
      customer                  = "retained"
      landing_zone_accelerator  = "true"
      landing_zone_configurator = "true"
    }
  }

  assert {
    condition     = stackit_resourcemanager_project.this.labels.landing_zone_accelerator == "true" && stackit_resourcemanager_project.this.labels.landing_zone_configurator == "true" && stackit_resourcemanager_project.this.labels.customer == "retained"
    error_message = "The planned management project must preserve customer labels and both Configurator provenance labels."
  }
}

mock_provider "vault" {}

mock_provider "time" {}

mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_project" {
    defaults = {
      project_id = "11111111-1111-4111-8111-111111111111"
    }
  }

  mock_resource "stackit_network_area" {
    defaults = {
      network_area_id = "22222222-2222-4222-8222-222222222222"
    }
  }

  mock_resource "stackit_network" {
    defaults = {
      network_id = "33333333-3333-4333-8333-333333333333"
    }
  }

  mock_resource "stackit_secretsmanager_instance" {
    defaults = {
      instance_id = "44444444-4444-4444-8444-444444444444"
    }
  }

  mock_resource "stackit_observability_instance" {
    defaults = {
      instance_id = "55555555-5555-4555-8555-555555555555"
    }
  }

  mock_resource "stackit_objectstorage_credentials_group" {
    defaults = {
      credentials_group_id = "66666666-6666-4666-8666-666666666666"
    }
  }

  mock_resource "stackit_service_account" {
    defaults = {
      email = "mock-service-account@sa.stackit.cloud"
    }
  }

  mock_resource "stackit_routing_table" {
    defaults = {
      routing_table_id = "77777777-7777-4777-8777-777777777777"
    }
  }

  mock_resource "stackit_service_account_key" {
    defaults = {
      json = "{}"
    }
  }

  mock_resource "stackit_network_interface" {
    defaults = {
      network_interface_id = "88888888-8888-4888-8888-888888888888"
    }
  }
}

mock_provider "stackit" {
  alias = "eu01"

  mock_resource "stackit_network_area" {
    defaults = { network_area_id = "22222222-2222-4222-8222-222222222222" }
  }

  mock_resource "stackit_routing_table" {
    defaults = { routing_table_id = "99999999-9999-4999-8999-999999999999" }
  }
}

mock_provider "stackit" {
  alias = "eu02"

  mock_resource "stackit_network_area" {
    defaults = { network_area_id = "33333333-3333-4333-8333-333333333333" }
  }

  mock_resource "stackit_routing_table" {
    defaults = { routing_table_id = "88888888-8888-4888-8888-888888888888" }
  }
}

variables {
  owner_email     = "example@digits.schwarz"
  company_name    = "Test Corp"
  company_code    = "tst"
  organization_id = "00000000-0000-0000-0000-000000000000"
  region          = "eu01"

  labels = {
    managed_by  = "opentofu"
    environment = "test"
  }

  rm_folders = {
    platform = {
      name          = "Platform - TST"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_corporate = {
      name          = "Landing Zones - Corporate - TST"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_public = {
      name          = "Landing Zones - Public - TST"
      owner_emails  = []
      reader_emails = []
    }
    sandboxes = {
      name          = "Sandboxes - TST"
      owner_emails  = []
      reader_emails = []
    }
  }

  devops = {
    git_flavor             = "git-10"
    allowed_network_ranges = ["0.0.0.0/0"]
  }

  # No connectivity — standalone flavour has no network area or firewall
  connectivity = null

  sandboxes = [
    {
      project_name        = "Test Sandbox"
      project_owner_email = "example@digits.schwarz"
    }
  ]

  landing_zones = {
    "test-public" = {
      project_name = "Test Public LZ"
      project_code = "tpub"
      owner_email  = "example@digits.schwarz"
      env          = "test"
      corporate    = false
    }
  }
}

run "standalone_plan" {
  command = plan

  assert {
    condition     = output.connectivity_network_area_id == null
    error_message = "Network area must be null in standalone configuration."
  }

  assert {
    condition     = output.connectivity_project_id == null
    error_message = "Connectivity project must not be created in standalone configuration."
  }

  assert {
    condition     = output.connectivity_firewall_public_ip == null
    error_message = "Firewall public IP must be null in standalone configuration."
  }

  assert {
    condition     = length(output.landing_zone_projects) == 1
    error_message = "Expected 1 landing zone to be created."
  }

  assert {
    condition     = output.landing_zone_projects["test-public"].landing_zone_type == "public"
    error_message = "test-public must be a public landing zone."
  }
}

run "implicit_corporate_requires_connectivity" {
  command = plan

  variables {
    landing_zones = {
      legacy = {
        project_name = "Legacy project"
        project_code = "legacy"
        owner_email  = "example@digits.schwarz"
        env          = "test"
      }
    }
  }

  expect_failures = [var.landing_zones]
}

run "reject_root_folder_description" {
  command = plan

  variables {
    rm_folders = merge(var.rm_folders, {
      landing_zones_public = {
        name          = "Public"
        description   = "Must not be ignored"
        owner_emails  = []
        reader_emails = []
      }
    })
  }

  expect_failures = [var.rm_folders]
}

run "reject_direct_governance_folder_description" {
  command = plan

  variables {
    rm_folders = {
      public = {
        name        = "Public"
        description = "Must not be ignored"
      }
    }
  }

  module {
    source = "./modules/governance"
  }

  expect_failures = [var.rm_folders]
}

run "direct_governance_empty_description_compatibility" {
  command = plan

  variables {
    rm_folders = {
      null_description = {
        name        = "Null description"
        description = null
      }
      empty_description = {
        name        = "Empty description"
        description = ""
      }
      whitespace_description = {
        name        = "Whitespace description"
        description = " \t\n"
      }
    }
  }

  module {
    source = "./modules/governance"
  }

  assert {
    condition     = length(output.folder_container_ids) == 4
    error_message = "Null, empty and whitespace-only descriptions must preserve all three folders and the root."
  }
}

run "empty_folder_description_compatibility" {
  command = plan

  variables {
    rm_folders = merge(var.rm_folders, {
      landing_zones_public = {
        name          = "Public"
        description   = ""
        owner_emails  = []
        reader_emails = []
      }
    })
  }

  assert {
    condition     = output.landing_zone_projects["test-public"].landing_zone_type == "public"
    error_message = "Empty deprecated folder descriptions must preserve the Public project contract."
  }
}

run "standalone_local_project_network" {
  command = plan

  variables {
    landing_zones = {
      "test-public" = {
        project_name          = "Test Public VM Network"
        project_code          = "tpub"
        owner_email           = "example@digits.schwarz"
        env                   = "test"
        corporate             = false
        network_enabled       = true
        network_prefix_length = 24
      }
    }
  }

  assert {
    condition     = module.landing_zone["test-public"].project_network != null && !module.landing_zone["test-public"].project_network.routed && module.landing_zone["test-public"].project_network.ipv4_prefix_length == 24
    error_message = "Standalone public projects must support a local VM network."
  }

  assert {
    condition     = output.connectivity_network_area_id == null && module.landing_zone["test-public"].connected_network_area_id == null
    error_message = "A local project network must not require connectivity or an SNA."
  }
}

run "management_monitoring_nullable_retention" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "tst-pltfm-mgmt-prod"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
    observability = {
      plan_name             = "Observability-Monitoring-Medium-EU01"
      logs_retention_days   = null
      traces_retention_days = null
    }
  }

  assert {
    condition     = var.observability.logs_retention_days == null && var.observability.traces_retention_days == null && try(var.observability.metrics_retention_days, null) == null
    error_message = "Monitoring must preserve omitted/null logs and traces retention while leaving metrics at the service default."
  }
}

run "management_monitoring_rejects_logs_retention" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "tst-pltfm-mgmt-prod"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
    observability = {
      plan_name           = "Observability-Monitoring-Medium-EU01"
      logs_retention_days = 14
    }
  }

  expect_failures = [var.observability]
}

run "management_observability_preserves_explicit_retention" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "tst-pltfm-mgmt-prod"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
    observability = {
      plan_name             = "Observability-Medium-EU01"
      logs_retention_days   = 14
      traces_retention_days = 7
    }
  }

  assert {
    condition     = stackit_observability_instance.this[0].logs_retention_days == 14 && stackit_observability_instance.this[0].traces_retention_days == 7
    error_message = "Explicit retention values must survive unchanged for a full Observability plan."
  }
}

run "root_monitoring_omits_unsupported_retention" {
  command = plan

  variables {
    observability = {
      plan_name = "Observability-Monitoring-Medium-EU01"
    }
  }

  assert {
    condition     = try(var.observability.logs_retention_days, null) == null && try(var.observability.traces_retention_days, null) == null
    error_message = "Root defaults must not inject unsupported log or trace retention into Monitoring plans."
  }
}

run "root_monitoring_rejects_traces_retention" {
  command = plan

  variables {
    observability = {
      plan_name             = "Observability-Monitoring-Medium-EU01"
      traces_retention_days = 14
    }
  }

  expect_failures = [var.observability]
}

run "management_project_unique_bucket_defaults" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "a-very-long-but-valid-management-resource-name-prefix"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
  }

  assert {
    condition = alltrue([
      for name in [stackit_objectstorage_bucket.default.name, stackit_objectstorage_bucket.tfstate.name, stackit_objectstorage_bucket.audit_logs.name] :
      length(name) <= 63 && strcontains(name, stackit_resourcemanager_project.this.project_id)
    ]) && length(toset([stackit_objectstorage_bucket.default.name, stackit_objectstorage_bucket.tfstate.name, stackit_objectstorage_bucket.audit_logs.name])) == 3
    error_message = "All bucket defaults must contain the full project UUID, remain distinct and fit the S3 name limit."
  }
}

run "management_legacy_bucket_names_require_explicit_choice" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "tst-pltfm-mgmt-prod"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
    bucket_naming       = "legacy"
  }

  assert {
    condition     = stackit_objectstorage_bucket.default.name == "tst-pltfm-mgmt-prod-default" && stackit_objectstorage_bucket.tfstate.name == "tst-pltfm-mgmt-prod-tfstate" && stackit_objectstorage_bucket.audit_logs.name == "tst-pltfm-mgmt-prod-audit-logs"
    error_message = "Explicit legacy mode must retain all existing bucket names exactly."
  }
}

run "frontend_omits_all_retention_overrides" {
  command = plan

  variables {
    observability = {
      plan_name = "Observability-Frontend-Starter-EU01"
    }
  }
}

run "frontend_rejects_metrics_override" {
  command = plan

  variables {
    observability = {
      plan_name              = "Observability-Frontend-Starter-EU01"
      metrics_retention_days = 90
    }
  }

  expect_failures = [var.observability]
}

run "observability_rejects_invalid_trace_retention" {
  command = plan

  variables {
    observability = {
      traces_retention_days = 31
    }
  }

  expect_failures = [var.observability]
}

run "management_identical_prefix_distinct_project" {
  command = plan

  module {
    source = "./modules/management"
  }

  variables {
    naming_pattern      = "a-very-long-but-valid-management-resource-name-prefix"
    parent_container_id = "00000000-0000-0000-0000-000000000000"
  }

  override_resource {
    target = stackit_resourcemanager_project.this
    values = {
      project_id = "99999999-9999-4999-8999-999999999999"
    }
  }

  assert {
    condition     = stackit_objectstorage_bucket.tfstate.name != "${substr(var.naming_pattern, 0, 18)}-11111111-1111-4111-8111-111111111111-tfstate" && strcontains(stackit_objectstorage_bucket.tfstate.name, "99999999-9999-4999-8999-999999999999")
    error_message = "Identical naming prefixes in distinct projects must produce distinct bucket names using the full immutable UUID."
  }
}

run "metrics_endpoint_rejects_retention_override" {
  command = plan

  variables {
    observability = {
      plan_name              = "Observability-Metrics-Endpoint-100k-EU01"
      metrics_retention_days = 90
    }
  }

  expect_failures = [var.observability]
}

run "standalone_workload_automation_role" {
  command = plan
  variables {
    landing_zones = {
      "test-public" = {
        project_name    = "Test workload permissions"
        project_code    = "tpub"
        owner_email     = "platform@example.com"
        corporate       = false
        automation_role = "application-reader"
        custom_roles = [{
          name        = "application-reader"
          description = "Application read access"
          permissions = ["iaas.server.get"]
        }]
      }
    }
  }
  assert {
    condition     = module.landing_zone["test-public"].project_access.automation_role == "application-reader" && module.landing_zone["test-public"].project_access.initial_owner_email == "platform@example.com"
    error_message = "The combined root must forward the explicit automation role and retain the separately configured initial owner."
  }
}
