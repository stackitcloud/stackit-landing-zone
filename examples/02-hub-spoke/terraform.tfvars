######################
## GENERAL SETTINGS ##
######################

# Email of the technical owner registered in STACKIT
owner_email = "matthias.hauber@prodyna.com"

# Company name used for folder naming in the resource manager
company_name = "Example Corp"

# Short company code used as prefix in resource naming (e.g. project names, service accounts)
company_code = "exc"

# Root organization container ID from STACKIT resource manager
organization_id = "b76b54b6-f55d-41a1-b3c3-30252f8b97cc"

region = "eu01"

# Labels applied to all resources for cost tracking / filtering
labels = {
  managed_by  = "opentofu"
  environment = "production"
  "preview/routingtables" = "true"
}

# Users with full organization-level owner permissions
# organization_owners = [
#   "org-owner@example.com"
# ]

# # Users with read-only audit access at the organization level
# organization_auditors = [
#   "auditor@example.com"
# ]

##################
## CONNECTIVITY ##
##################

# DNS zones managed in the connectivity project
dns_zones = {
  "prodyna" = {
    dns_name = "prodyna.stackit.run"
  }
}

# Network area configuration for the connectivity hub
network_area = {
  ranges                = ["10.0.0.0/16"]
  transfer_network      = "10.255.0.0/24"
  min_prefix_length     = 24
  max_prefix_length     = 28
  default_prefix_length = 25
}

# Delete the variable to skip firewall deployment (network area and routing still created)
firewall = {
  zone       = "eu01-m"
  flavor     = "c1.2"
  lan_ip     = "10.0.0.220"
  lan_prefix = "10.0.0.128/25"
  wan_ip     = "10.0.1.1"
  wan_prefix = "10.0.1.0/25"
}

###############
## SANDBOXES ##
###############

# Sandbox projects for experimentation / PoCs
# sandboxes = [
#   {
#     project_name        = "Sandbox Team Alpha"
#     project_owner_email = "alpha-lead@example.com"
#     owner_emails        = ["dev1@example.com", "dev2@example.com"]
#   },
# ]

###################
## LANDING ZONES ##
###################

# Landing zones keyed by a unique identifier
# Set corporate = true for network area connectivity, false for public internet
landing_zones = {
  # "app-backend" = {
  #   project_name = "Backend Services"
  #   project_code = "be"
  #   owner_email  = "backend-team@example.com"
  #   env          = "prod"
  #   corporate    = true

  #   # Subnet size assigned from the network area (/25 = 128 addresses)
  #   network_prefix_length = 25

  #   role_assignments = [
  #     {
  #       role    = "project.owner"
  #       subject = "backend-lead@example.com"
  #     },
  #     {
  #       role    = "project.member"
  #       subject = "backend-dev@example.com"
  #     }
  #   ]

  #   custom_roles = [
  #     {
  #       name        = "deployer"
  #       description = "Can deploy workloads"
  #       permissions = ["project.resources.read", "project.resources.write"]
  #     }
  #   ]
  # }

  "data-platform" = {
    project_name = "Data Platform"
    project_code = "data"
    owner_email  = "matthias.hauber@prodyna.com"
    env          = "prod"
    corporate    = true

    network_prefix_length = 24
  }

  # Public landing zone — no network area, uses STACKIT's default public networking
  "external-api" = {
    project_name = "External API Gateway"
    project_code = "api"
    owner_email  = "matthias.hauber@prodyna.com"
    env          = "prod"
    corporate    = false

    # role_assignments = [
    #   {
    #     role    = "project.owner"
    #     subject = "api-lead@example.com"
    #   }
    # ]
  }
}
