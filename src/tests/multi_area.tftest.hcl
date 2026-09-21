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