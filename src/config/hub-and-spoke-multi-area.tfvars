###########################
## MULTI-AREA CONNECTIVITY ##
###########################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# Area keys represent arbitrary business, security, tenant, or regional boundaries.
# This example isolates regulated workloads while less-sensitive shared workloads
# use a second SNA. Landing zones select their SNA with network_area_key.
connectivity = {
  naming_pattern = "example-connectivity"

  network_areas = {
    regulated = {
      name                  = "regulated-sna"
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.255.0.0/24"
      min_prefix_length     = 24
      max_prefix_length     = 28
      default_prefix_length = 25
    }
    shared = {
      name                  = "shared-sna"
      ranges                = ["10.1.0.0/16"]
      transfer_network      = "10.254.0.0/24"
      min_prefix_length     = 24
      max_prefix_length     = 28
      default_prefix_length = 25
    }
  }

  dns_zones = {
    regulated = {
      dns_name         = "regulated.example.stackit.run"
      network_area_key = "regulated"
    }
    shared = {
      dns_name         = "shared.example.stackit.run"
      network_area_key = "shared"
    }
  }
}

landing_zones = {
  regulated_workload = {
    project_name          = "Regulated Workload"
    project_code          = "regulated"
    owner_email           = "platform@example.com"
    env                   = "live"
    corporate             = true
    network_area_key      = "regulated"
    network_prefix_length = 24
  }
  shared_workload = {
    project_name          = "Shared Workload"
    project_code          = "shared"
    owner_email           = "platform@example.com"
    env                   = "live"
    corporate             = true
    network_area_key      = "shared"
    network_prefix_length = 24
  }
}