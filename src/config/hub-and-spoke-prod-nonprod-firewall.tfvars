#######################################
## PROD/NONPROD WITH FIREWALLS       ##
#######################################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# Production and non-production each receive an isolated SNA and firewall.
# The firewall CIDRs are distinct and must be contained in their area's ranges.
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

  firewalls = {
    prod = {
      zone              = "eu01-m"
      flavor            = "c1.2"
      name              = "opnsense-prod"
      lan_network_range = "10.0.2.0/28"
      wan_network_range = "10.0.2.16/28"
    }
    nonprod = {
      zone              = "eu01-m"
      flavor            = "c1.2"
      name              = "opnsense-nonprod"
      lan_network_range = "10.2.2.0/28"
      wan_network_range = "10.2.2.16/28"
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

# The automatic firewall_config integration configures a single appliance only.
# Configure the policies for both firewalls independently after bootstrap.