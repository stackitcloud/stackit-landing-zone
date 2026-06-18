######################
## GENERAL SETTINGS ##
######################

# Email of the technical owner registered in STACKIT
owner_email = "eu01-fhnnk51@ske.sa.stackit.cloud"

# Company name used for folder naming in the resource manager
company_name = "Example Corp"

# Short company code used as prefix in resource naming (e.g. project names, service accounts)
company_code = "exc"

# Root organization container ID from STACKIT resource manager
organization_id = "b76b54b6-f55d-41a1-b3c3-30252f8b97cc"

region = "eu01"

# Labels applied to all resources, max. 64 characters
labels = {
  managed_by = "opentofu"
}

# # Users with full organization-level owner permissions
# organization_owners = [
#   "org-owner@example.com"
# ]

# # Users with read-only audit access at the organization level
# organization_auditors = [
#   "auditor@example.com"
# ]

# observability = {
#   plan_name = "Observability-Starter-EU01"
# }

# # Federated identity providers for the management service account (e.g. GitHub Actions OIDC)
# federated_identity_providers = [
#   {
#     name   = "gh-actions"
#     issuer = "https://token.actions.githubusercontent.com"
#     assertions = [
#       {
#         item     = "aud"
#         operator = "equals"
#         value    = "sts.accounts.stackit.cloud"
#       },
#       {
#         item     = "sub"
#         operator = "equals"
#         value    = "repo:my-org/my-repo:ref:refs/heads/main"
#       }
#     ]
#   }
# ]

##################
## CONNECTIVITY ##
##################

connectivity = {
  # DNS zones managed in the connectivity project
  dns_zones = {
    "example-corp" = {
      dns_name = "example-corp.stackit.run"
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
}

############
## DEVOPS ##
############

# devops = {
#   git_flavor = "git-10"
#   allowed_network_ranges = ["0.0.0.0/0"]
# }

# platform_kubernetes = {
#   "eu01" = {
#     region = "eu01"
#     network = {
#       sna_enabled = true
#     }
#     cluster = {
#       name                   = "pltfmk8s"
#       kubernetes_version_min = "1.35"
#     }
#
#     # Defaults to disabled. Set true to enable encrypted storage class setup.
#     encrypted_volumes = {
#       enabled = false
#     }
#   }
# }

###############
## SANDBOXES ##
###############

# Sandbox projects for experimentation / PoCs
sandboxes = [
  {
    project_name        = "Sandbox Team Alpha"
    project_owner_email = "eu01-fhnnk51@ske.sa.stackit.cloud"
  }
]

###################
## LANDING ZONES ##
###################

landing_zones = {
  "corp-exmpl" = {
    project_name = "Data Platform"
    project_code = "data"
    owner_email  = "eu01-fhnnk51@ske.sa.stackit.cloud"
    env          = "prod"

    # Set corporate = true for network area connectivity, false for public internet
    corporate             = true
    network_prefix_length = 24

  }

  # Public landing zone — no network area, uses STACKIT's default public networking
  "public-exmpl" = {
    project_name = "External API Gateway"
    project_code = "api"
    owner_email  = "eu01-fhnnk51@ske.sa.stackit.cloud"
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

# Optional: create namespace services in the central platform Kubernetes cluster.
# landing_zone_namespace_services = {
#   "corp-exmpl" = {
#     namespace      = "data-prod"
#     dns_subdomain  = "app"
#     secretsmanager = true
#   }
# }