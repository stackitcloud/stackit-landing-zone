variables {
  owner_email     = "matthias.hauber@prodyna.com"
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

  # No connectivity — standalone flavour has no network area or firewall
  connectivity = null

  sandboxes = [
    {
      project_name        = "Test Sandbox"
      project_owner_email = "matthias.hauber@prodyna.com"
    }
  ]

  landing_zones = {
    "test-public" = {
      project_name = "Test Public LZ"
      project_code = "tpub"
      owner_email  = "matthias.hauber@prodyna.com"
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
