# Email of the technical owner registered in STACKIT
owner_email = "platform-team@example.com"

# Company name used for folder naming in the resource manager
company_name = "Example Corp"

# Short company code used as prefix in resource naming (e.g. project names, service accounts)
company_code = "exc"

# Root organization container ID from STACKIT resource manager
organization_id = "org-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

region = "eu01"

# Labels applied to all resources for cost tracking / filtering
labels = {
  managed_by  = "opentofu"
  environment = "production"
}

# Users with full organization-level owner permissions
organization_owners = [
  "org-owner@example.com"
]

# Users with read-only audit access at the organization level
organization_auditors = [
  "auditor@example.com"
]

# DNS zones managed in the connectivity project
dns_zones = {
  "prodyna" = {
    dns_name = "prodyna.stackit.run"
  }
}

# IP ranges that will be sliced into per-project subnets
network_ranges = [
  { prefix = "10.1.0.0/16" },
  { prefix = "10.2.0.0/16" }
]

# Transfer network used for routing between projects in this area
transfer_network_range = "10.255.0.0/24"

# Controls the subnet sizes assigned to individual projects
min_prefix_length     = 24
max_prefix_length     = 28
default_prefix_length = 25

# Set to false to skip firewall deployment (network area and routing still created)
# firewall_enabled = false

# Availability zone for the firewall VM
firewall_zone = "eu01-m"

# VM flavor for the pfSense firewall
firewall_flavor = "c1.2"

# CIDR range for the connectivity project's own VNet (firewall LAN side)
connectivity_vnet_range = "10.0.0.0/24"

# Static LAN IP of the pfSense firewall (used as default gateway)
firewall_ip = "10.0.0.220"

###############
## SANDBOXES ##
###############

# Sandbox projects for experimentation / PoCs
sandboxes = [
  {
    project_name        = "Sandbox Team Alpha"
    project_owner_email = "alpha-lead@example.com"
    owner_emails        = ["dev1@example.com", "dev2@example.com"]
  },
  {
    project_name        = "Sandbox Data Science"
    project_owner_email = "ds-lead@example.com"
  }
]

##################
## LANDING ZONE ##
##################

# Landing zones keyed by a unique identifier
# Set corporate = true for network area connectivity, false for public internet
landing_zones = {
  "app-backend" = {
    project_name = "Backend Services"
    project_code = "be"
    owner_email  = "backend-team@example.com"
    env          = "prod"
    corporate    = true

    # Subnet size assigned from the network area (/25 = 128 addresses)
    network_prefix_length = 25

    role_assignments = [
      {
        role    = "project.owner"
        subject = "backend-lead@example.com"
      },
      {
        role    = "project.member"
        subject = "backend-dev@example.com"
      }
    ]

    custom_roles = [
      {
        name        = "deployer"
        description = "Can deploy workloads"
        permissions = ["project.resources.read", "project.resources.write"]
      }
    ]
  }

  "data-platform" = {
    project_name = "Data Platform"
    project_code = "data"
    owner_email  = "data-team@example.com"
    env          = "prod"
    corporate    = true

    network_prefix_length = 24
  }

  # Public landing zone — no network area, uses STACKIT's default public networking
  "external-api" = {
    project_name = "External API Gateway"
    project_code = "api"
    owner_email  = "api-team@example.com"
    env          = "prod"
    corporate    = false

    role_assignments = [
      {
        role    = "project.owner"
        subject = "api-lead@example.com"
      }
    ]
  }
}
