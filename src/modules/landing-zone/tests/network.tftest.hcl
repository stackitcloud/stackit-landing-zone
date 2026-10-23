mock_provider "stackit" {
  mock_data "stackit_network_area_region" {
    defaults = {
      ipv4 = {
        min_prefix_length     = 24
        max_prefix_length     = 28
        transfer_network      = "10.254.255.0/24"
        network_ranges        = [{ network_range_id = "77777777-2222-4333-8444-555555555555", prefix = "10.32.0.0/16" }]
        default_prefix_length = 28
        default_nameservers   = ["192.0.2.54"]
      }
    }
  }

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
mock_provider "stackit" {
  alias = "eu02"

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

  mock_data "stackit_network_area_region" {
    defaults = {
      ipv4 = {
        min_prefix_length     = 24
        max_prefix_length     = 28
        transfer_network      = "10.254.255.0/24"
        network_ranges        = [{ network_range_id = "77777777-2222-4333-8444-555555555555", prefix = "10.32.0.0/16" }]
        default_prefix_length = 27
        default_nameservers   = ["192.0.2.55"]
      }
    }
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
    condition     = stackit_objectstorage_credentials_group.this.name == var.naming_pattern
    error_message = "Existing credentials group names within the API limit must remain unchanged."
  }

  assert {
    condition     = length(stackit_network.this) == 0 && length(data.stackit_network_area_region.defaults) == 0
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

run "corporate_automatic_prefix_preserves_dns" {
  command = plan

  variables {
    corporate        = true
    network_area_id  = "33333333-2222-4333-8444-555555555555"
    ipv4_nameservers = ["192.0.2.53"]
  }

  assert {
    condition     = length(data.stackit_network_area_region.defaults) == 1 && data.stackit_network_area_region.defaults[0].network_area_id == var.network_area_id && data.stackit_network_area_region.defaults[0].organization_id == var.organization_id && stackit_network.this[0].ipv4_prefix_length == 28
    error_message = "Automatic Corporate size must inherit the selected SNA region's actual /28 default, not an arbitrary /24."
  }

  assert {
    condition     = stackit_network.this[0].ipv4_nameservers == tolist(["192.0.2.53"]) && stackit_network.this[0].routed
    error_message = "Reading the network area's size must preserve the bound target's DNS and routed semantics."
  }
}

run "corporate_explicit_prefix_skips_sna_read" {
  command = plan

  variables {
    corporate             = true
    network_area_id       = "33333333-2222-4333-8444-555555555555"
    network_prefix_length = 26
    ipv4_nameservers      = []
  }

  assert {
    condition     = length(data.stackit_network_area_region.defaults) == 0 && stackit_network.this[0].ipv4_prefix_length == 26 && length(stackit_network.this[0].ipv4_nameservers) == 0
    error_message = "An explicit /26 and an intentionally empty DNS list must survive without querying the SNA default."
  }
}

run "public_automatic_skips_sna_read" {
  command = plan

  variables {
    network_enabled = true
  }

  assert {
    condition     = length(data.stackit_network_area_region.defaults) == 0 && !stackit_network.this[0].routed
    error_message = "Automatic Public networking must not query a Corporate SNA."
  }
}

run "corporate_automatic_uses_inherited_regional_provider" {
  command = plan

  providers = {
    stackit = stackit.eu02
  }

  variables {
    corporate       = true
    network_area_id = "33333333-2222-4333-8444-555555555555"
  }

  assert {
    condition     = stackit_network.this[0].ipv4_prefix_length == 27 && data.stackit_network_area_region.defaults[0].ipv4.default_prefix_length == 27
    error_message = "The SNA default must come from the module's regional provider, not a hard-coded eu01 provider."
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

run "objectstorage_credentials_group_name_bounded" {
  command = plan

  variables {
    naming_pattern = "app-116aee67-9384-4b50-a683-f392b6367e0d-dev"
    bucket_naming  = "legacy"
  }

  assert {
    condition     = length(stackit_objectstorage_credentials_group.this.name) == 32 && stackit_objectstorage_credentials_group.this.name == "${substr(var.naming_pattern, 0, 23)}-${substr(sha256(var.naming_pattern), 0, 8)}"
    error_message = "UUID-based Application credentials group names must fit the 32-character API limit with a stable hash suffix."
  }

  assert {
    condition     = stackit_objectstorage_bucket.default.name == "${var.naming_pattern}-default"
    error_message = "Bounding the credentials group name must not rename buckets or other resources."
  }
}

run "objectstorage_credentials_group_name_distinct" {
  command = plan

  variables {
    naming_pattern = "app-116aee67-9384-4b50-a683-f392b6367e0e-dev"
  }

  assert {
    condition     = length(stackit_objectstorage_credentials_group.this.name) == 32 && stackit_objectstorage_credentials_group.this.name != "${substr("app-116aee67-9384-4b50-a683-f392b6367e0d-dev", 0, 23)}-${substr(sha256("app-116aee67-9384-4b50-a683-f392b6367e0d-dev"), 0, 8)}"
    error_message = "Credentials group names with a shared truncated prefix must remain distinct."
  }
}
run "project_qualified_bucket_defaults" {
  command = plan

  variables {
    naming_pattern = "a-very-long-but-valid-application-resource-name-prefix"
  }

  assert {
    condition = alltrue([
      for name in [stackit_objectstorage_bucket.default.name, stackit_objectstorage_bucket.tfstate.name] :
      length(name) <= 63 && strcontains(name, stackit_resourcemanager_project.this.project_id)
    ]) && stackit_objectstorage_bucket.default.name != stackit_objectstorage_bucket.tfstate.name
    error_message = "Workload buckets must include their full owning project UUID with distinct purposes within 63 characters."
  }
}

run "explicit_legacy_bucket_compatibility" {
  command = plan

  variables {
    bucket_naming = "legacy"
  }

  assert {
    condition     = stackit_objectstorage_bucket.default.name == "application-dev-default" && stackit_objectstorage_bucket.tfstate.name == "application-dev-tfstate"
    error_message = "Explicit legacy mode must preserve existing workload bucket names."
  }
}
