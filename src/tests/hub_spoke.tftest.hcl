variables {
  owner_email     = "example@digits.schwarz"
  company_name    = "Test Corp"
  company_code    = "tst"
  organization_id = "b76b54b6-f55d-41a1-b3c3-30252f8b97cc"
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
  }

  sandboxes = []

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

# Validates hub-spoke without firewall: connectivity module is created, no firewall.
# Resource-computed outputs (network_area_id, project_id) are unknown during plan
# and cannot be asserted — a successful plan is the primary validation.
run "hub_spoke_plan" {
  command = plan

  assert {
    condition     = output.connectivity_firewall_public_ip == null
    error_message = "Firewall public IP must be null when no firewall is configured."
  }

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
}