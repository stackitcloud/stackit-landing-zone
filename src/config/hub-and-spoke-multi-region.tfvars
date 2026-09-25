##########################
## MULTI-REGION HUB-SPOKE ##
##########################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"

# Each enabled region creates an independent connectivity hub through its static
# provider alias. Hubs do not communicate implicitly; configure VPN peers and
# routes explicitly when inter-region traffic is required.
connectivity_regions = {
  eu01 = {
    naming_pattern = "exc-connectivity-eu01"
    network_areas = {
      primary = {
        name                  = "eu01-primary-sna"
        ranges                = ["10.0.0.0/16"]
        transfer_network      = "10.1.0.0/24"
        min_prefix_length     = 24
        max_prefix_length     = 28
        default_prefix_length = 25
      }
    }
  }
  eu02 = {
    naming_pattern = "exc-connectivity-eu02"
    network_areas = {
      primary = {
        name                  = "eu02-primary-sna"
        ranges                = ["10.2.0.0/16"]
        transfer_network      = "10.3.0.0/24"
        min_prefix_length     = 24
        max_prefix_length     = 28
        default_prefix_length = 25
      }
    }
  }
}

platform_kubernetes = {
  eu01 = {
    region = "eu01"
    network = {
      sna_enabled      = true
      network_area_key = "primary"
    }
    cluster = {
      name = "platform-eu01"
    }
  }
  eu02 = {
    region = "eu02"
    network = {
      sna_enabled      = true
      network_area_key = "primary"
    }
    observability = {
      enabled = false
    }
    cluster = {
      name = "platform-eu02"
      node_pools = [
        {
          name               = "system"
          machine_type       = "g3i.4"
          minimum            = 2
          maximum            = 2
          availability_zones = ["eu02-1"]
        },
        {
          name               = "application"
          machine_type       = "g3i.4"
          minimum            = 2
          maximum            = 2
          availability_zones = ["eu02-2"]
        },
      ]
    }
  }
}

landing_zones = {
  eu01_workload = {
    project_name          = "EU01 Workload"
    project_code          = "eu01app"
    owner_email           = "platform@example.com"
    env                   = "prod"
    region                = "eu01"
    corporate             = true
    network_area_key      = "primary"
    network_prefix_length = 24
  }
  eu02_workload = {
    project_name           = "EU02 Workload"
    project_code           = "eu02app"
    owner_email            = "platform@example.com"
    env                    = "prod"
    region                 = "eu02"
    corporate              = true
    network_area_key       = "primary"
    network_prefix_length  = 24
    secretsmanager_enabled = false
  }
}