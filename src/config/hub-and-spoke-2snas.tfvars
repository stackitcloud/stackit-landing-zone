#########################
## TWO-SNA ENVIRONMENTS ##
#########################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# Production is isolated. Development and test use the shared non-production SNA.
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
    nonprod = {
      name                  = "nonprod-sna"
      ranges                = ["10.2.0.0/16"]
      transfer_network      = "10.3.0.0/24"
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
    network_area_key      = "nonprod"
    network_prefix_length = 24
  }
  test = {
    project_name          = "Test Workload"
    project_code          = "test"
    owner_email           = "platform@example.com"
    env                   = "test"
    corporate             = true
    network_area_key      = "nonprod"
    network_prefix_length = 24
  }
}