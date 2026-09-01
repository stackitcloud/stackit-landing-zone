############################################
## FINANCE AND RESEARCH BUSINESS UNITS     ##
############################################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# Finance and research have independent owners, address plans, and connectivity
# requirements, but share the same STACKIT organization.
connectivity = {
  naming_pattern = "exc-connectivity"

  network_areas = {
    finance = {
      name                  = "finance-sna"
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.1.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
    research = {
      name                  = "research-sna"
      ranges                = ["10.2.0.0/16"]
      transfer_network      = "10.3.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
  }
}

landing_zones = {
  finance = {
    project_name          = "Finance Workload"
    project_code          = "finance"
    owner_email           = "finance-platform@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "finance"
    network_prefix_length = 24
  }
  research = {
    project_name          = "Research Workload"
    project_code          = "research"
    owner_email           = "research-platform@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "research"
    network_prefix_length = 24
  }
}