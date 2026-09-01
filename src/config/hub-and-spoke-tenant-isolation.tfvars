#################################
## THREE-TENANT ISOLATION       ##
#################################

owner_email     = "platform@example.com"
company_name    = "Example Corp"
company_code    = "exc"
organization_id = "00000000-0000-0000-0000-000000000000"
region          = "eu01"

# STACKIT organizations are shared at company level. These three tenants need
# independent private address spaces and must not share private connectivity.
connectivity = {
  naming_pattern = "exc-connectivity"

  network_areas = {
    tenant_a = {
      name                  = "tenant-a-sna"
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.1.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
    tenant_b = {
      name                  = "tenant-b-sna"
      ranges                = ["10.2.0.0/16"]
      transfer_network      = "10.3.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
    tenant_c = {
      name                  = "tenant-c-sna"
      ranges                = ["10.4.0.0/16"]
      transfer_network      = "10.5.0.0/24"
      max_prefix_length     = 28
      min_prefix_length     = 24
      default_prefix_length = 26
    }
  }
}

landing_zones = {
  tenant_a = {
    project_name          = "Tenant A Workload"
    project_code          = "tenanta"
    owner_email           = "tenant-a@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "tenant_a"
    network_prefix_length = 24
  }
  tenant_b = {
    project_name          = "Tenant B Workload"
    project_code          = "tenantb"
    owner_email           = "tenant-b@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "tenant_b"
    network_prefix_length = 24
  }
  tenant_c = {
    project_name          = "Tenant C Workload"
    project_code          = "tenantc"
    owner_email           = "tenant-c@example.com"
    env                   = "prod"
    corporate             = true
    network_area_key      = "tenant_c"
    network_prefix_length = 24
  }
}