mock_provider "stackit" {
  mock_resource "stackit_scf_organization" {
    defaults = {
      org_id = "00000000-0000-4000-8000-000000000010"
    }
  }
  mock_resource "stackit_postgresflex_instance" {
    defaults = {
      instance_id = "00000000-0000-4000-8000-000000000011"
    }
  }
  mock_resource "stackit_secretsmanager_instance" {
    defaults = {
      instance_id = "00000000-0000-4000-8000-000000000012"
    }
  }
}

variables {
  project_id            = "00000000-0000-4000-8000-000000000001"
  region                = "eu01"
  name_prefix           = "lzc-test"
  cf_platform_id        = "00000000-0000-4000-8000-000000000002"
  cf_quota_id           = "00000000-0000-4000-8000-000000000003"
  database_access_cidrs = ["192.0.2.10/32"]
  secrets_access_cidrs  = ["198.51.100.10/32"]
  database = {
    flavor_id       = "test-flavor"
    version         = "17"
    storage_class   = "test-storage"
    storage_size_gb = 5
    backup_schedule = "0 2 * * *"
    retention_days  = 32
  }
}

run "service_boundaries" {
  command = plan
  assert {
    condition     = stackit_secretsmanager_instance.configurator.acls == toset(["198.51.100.10/32"])
    error_message = "Secrets must be restricted to the configured egress ranges."
  }
  assert {
    condition     = stackit_modelserving_token.configurator.ttl_duration == "2160h"
    error_message = "Model-serving tokens must have a bounded lifetime."
  }
}

run "reject_public_database_and_secrets" {
  command = plan
  variables {
    database_access_cidrs = ["0.0.0.0/0"]
  }
  expect_failures = [var.database_access_cidrs]
}

run "reject_empty_access_list" {
  command = plan
  variables {
    database_access_cidrs = []
  }
  expect_failures = [var.database_access_cidrs]
}

run "reject_noncanonical_default_route" {
  command = plan
  variables {
    database_access_cidrs = ["192.0.2.1/0"]
  }
  expect_failures = [var.database_access_cidrs]
}

run "reject_public_secrets" {
  command = plan
  variables { secrets_access_cidrs = ["0.0.0.0/0"] }
  expect_failures = [var.secrets_access_cidrs]
}
run "separate_service_networks" {
  command = plan
  assert {
    condition     = toset(stackit_postgresflex_instance.configurator.network.acl) == toset(["192.0.2.10/32"])
    error_message = "Database must use its own ACL, independently of Secrets Manager."
  }
}
