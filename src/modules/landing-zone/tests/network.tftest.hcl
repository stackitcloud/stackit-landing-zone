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
  organization_id     = "11111111-2222-4333-8444-555555555555"
  parent_container_id = "22222222-2222-4333-8444-555555555555"
  owner_email         = "owner@example.com"
  naming_pattern      = "application-dev"
  custom_roles        = []
}

run "legacy_public_without_network" {
  command = plan

  assert {
    condition     = length(stackit_network.this) == 0
    error_message = "Existing public projects must not gain a network implicitly."
  }
}

run "local_project_network" {
  command = plan

  variables {
    network_enabled       = true
    network_prefix_length = 24
    firewall_next_hop_ip  = "10.0.0.1"
  }

  assert {
    condition     = length(stackit_network.this) == 1 && !stackit_network.this[0].routed && stackit_network.this[0].name == "application-dev-local" && stackit_network.this[0].ipv4_prefix_length == 24
    error_message = "An enabled public network must be local and preserve its requested prefix."
  }

  assert {
    condition     = length(stackit_routing_table.this) == 0 && length(stackit_routing_table_route.this) == 0
    error_message = "A local network must not reference SNA routing, even when a firewall next hop is present."
  }
}

run "legacy_corporate_network" {
  command = plan

  variables {
    corporate       = true
    network_area_id = "33333333-2222-4333-8444-555555555555"
  }

  assert {
    condition     = length(stackit_network.this) == 1 && stackit_network.this[0].routed && stackit_network.this[0].name == "application-dev-routed"
    error_message = "Corporate projects must retain their existing routed network and resource name."
  }
}

run "observability_acl_existing_value" {
  command = apply

  variables {
    observability = {
      enabled   = true
      plan_name = "Observability-Starter-EU01"
      acl       = ["203.0.113.0/24"]
    }
  }

  assert {
    condition     = stackit_observability_instance.this[0].acl == toset(["203.0.113.0/24"])
    error_message = "The existing ACL fixture must be preserved in state."
  }
}

run "observability_acl_user_managed" {
  command = plan

  variables {
    observability = {
      enabled   = true
      plan_name = "Observability-Starter-EU01"
      acl       = []
    }
  }

  assert {
    condition     = stackit_observability_instance.this[0].acl == toset(["203.0.113.0/24"])
    error_message = "A later plan must not replace a user-managed ACL with an empty list."
  }
}