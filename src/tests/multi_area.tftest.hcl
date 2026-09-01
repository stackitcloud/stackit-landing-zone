variables {
  owner_email     = "example@digits.schwarz"
  company_name    = "Test Corp"
  company_code    = "tst"
  organization_id = "b76b54b6-f55d-41a1-b3c3-30252f8b97cc"

  connectivity = {
    network_areas = {
      prod = {
        name             = "hub-primary"
        ranges           = ["10.0.0.0/16"]
        transfer_network = "10.255.0.0/24"
      }
      nonprod = {
        name             = "hub-secondary"
        ranges           = ["10.1.0.0/16"]
        transfer_network = "10.254.0.0/24"
      }
    }
    dns_zones = {
      primary = {
        dns_name         = "primary.test.stackit.run"
        network_area_key = "prod"
      }
      secondary = {
        dns_name         = "secondary.test.stackit.run"
        network_area_key = "nonprod"
      }
    }
  }

  landing_zones = {
    production = {
      project_name          = "Production"
      project_code          = "prod"
      owner_email           = "example@digits.schwarz"
      env                   = "prod"
      corporate             = true
      network_area_key      = "prod"
      network_prefix_length = 24
    }
    development = {
      project_name          = "Development"
      project_code          = "dev"
      owner_email           = "example@digits.schwarz"
      env                   = "dev"
      corporate             = true
      network_area_key      = "nonprod"
      network_prefix_length = 24
    }
  }
}

run "multi_area_plan" {
  command = plan

  assert {
    condition     = length(output.landing_zone_projects) == 2
    error_message = "Expected production and development landing zones."
  }
}