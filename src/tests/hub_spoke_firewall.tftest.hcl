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
}

mock_provider "stackit" {
  alias = "eu02"
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

  observability = {
    plan_name = "Observability-Starter-EU01"
  }

  connectivity = {
    dns_zones = {
      "test-corp" = {
        dns_name = "test-corp.stackit.run"
      }
    }
    network_area = {
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.255.0.0/24"
      min_prefix_length     = 24
      max_prefix_length     = 28
      default_prefix_length = 25
    }
    firewall = {
      zone              = "eu01-m"
      flavor            = "c1.2"
      lan_network_range = "10.0.0.0/28"
      wan_network_range = "10.0.0.16/28"
      name              = "opnsense-26.1"
    }
  }

  sandboxes = [
    {
      project_name        = "Test Sandbox"
      project_owner_email = "example@digits.schwarz"
    }
  ]

  landing_zones = {
    "test-corporate" = {
      project_name          = "Test Corporate LZ"
      project_code          = "tcorp"
      owner_email           = "example@digits.schwarz"
      env                   = "test"
      corporate             = true
      network_prefix_length = 25
    }
    "test-public" = {
      project_name = "Test Public LZ"
      project_code = "tpub"
      owner_email  = "example@digits.schwarz"
      env          = "test"
      corporate    = false
    }
  }
}

# Validates hub-spoke-firewall variant. Resource-computed outputs (network_area_id,
# project_id, firewall_public_ip) are unknown during plan and cannot be asserted —
# a successful plan is the primary validation.
run "hub_spoke_firewall_plan" {
  command = plan

  assert {
    condition     = length(output.landing_zone_projects) == 2
    error_message = "Expected 2 landing zones to be created."
  }

  assert {
    condition     = output.landing_zone_projects["test-corporate"].landing_zone_type == "corporate"
    error_message = "test-corporate must be a corporate landing zone."
  }

  assert {
    condition     = output.landing_zone_projects["test-public"].landing_zone_type == "public"
    error_message = "test-public must be a public landing zone."
  }

  assert {
    condition     = output.connectivity_firewall_next_hop_ip == "10.0.0.4"
    error_message = "Without HA the landing zones must be routed at the primary's LAN IP."
  }

  assert {
    condition     = output.connectivity_firewall_backup_public_ip == null
    error_message = "Without HA there must be no backup appliance."
  }
}

# Same flavour with the active/passive CARP pair. The VIP and both node addresses are
# derived from lan_network_range, so they are known at plan time even though the
# appliances are not.
run "hub_spoke_firewall_ha_plan" {
  command = plan

  variables {
    connectivity = {
      dns_zones = {
        "test-corp" = {
          dns_name = "test-corp.stackit.run"
        }
      }
      network_area = {
        ranges                = ["10.0.0.0/16"]
        transfer_network      = "10.255.0.0/24"
        min_prefix_length     = 24
        max_prefix_length     = 28
        default_prefix_length = 25
      }
      firewall = {
        zone              = "eu01-m"
        flavor            = "c1.2"
        lan_network_range = "10.0.0.0/28"
        wan_network_range = "10.0.0.16/28"
        name              = "opnsense-26.1"

        ha = {
          backup_zone = "eu01-1"
        }
      }
    }
  }

  assert {
    condition     = output.connectivity_firewall_next_hop_ip == "10.0.0.6"
    error_message = "Under HA the landing zones must be routed at the CARP LAN VIP, not at a node address."
  }
}
