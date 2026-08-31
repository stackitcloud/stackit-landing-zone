###########################
## THREE-SNA ENVIRONMENTS ##
###########################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# Every environment receives its own isolated SNA.
connectivity = {
  naming_pattern = "exc-connectivity"

  network_areas = {
    prod = {
      name                  = "prod-sna"
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.1.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
    dev = {
      name                  = "dev-sna"
      ranges                = ["10.2.0.0/16"]
      transfer_network      = "10.3.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
    test = {
      name                  = "test-sna"
      ranges                = ["10.4.0.0/16"]
      transfer_network      = "10.5.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
  }
}

landing_zones = {
  production = {
    project_name          = "Production Workload"
    project_code          = "prod"
    owner_email           = "platform@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "prod"
    network_prefix_length = 24
  }
  development = {
    project_name          = "Development Workload"
    project_code          = "dev"
    owner_email           = "platform@example.com"
    env                   = "dev"
    corporate             = true
    network_area_key      = "dev"
    network_prefix_length = 24
  }
  test = {
    project_name          = "Test Workload"
    project_code          = "test"
    owner_email           = "platform@example.com"
    env                   = "test"
    corporate             = true
    network_area_key      = "test"
    network_prefix_length = 24
  }
}