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

  # Delete the variable to skip firewall deployment
  firewall = {
    zone              = "eu01-m"
    flavor            = "c1.2"
    name              = "opnsense-26.1"
    lan_network_range = "10.0.2.0/28"
    wan_network_range = "10.0.2.16/28"
  }

  # Optional: site-to-site IPsec VPN terminating in the hub. Uncomment to enable
  #
  # Pre-shared keys need to be supplied separately:
  #   export TF_VAR_vpn_pre_shared_keys='{"onprem"={"tunnel1"="<20+ chars>","tunnel2"="<20+ chars>"}}'
  #
  # vpn = {
  #   plan_id      = "p100"           # p100 = 1 connection, p500 = 3, p1000 = 5
  #   routing_type = "ROUTE_BASED"    # or POLICY_BASED
  #
  #   availability_zones = {
  #     tunnel1 = "eu01-1"
  #     tunnel2 = "eu01-2"
  #   }
  #
  #   connections = {
  #     "onprem" = {
  #       # Remote prefixes reachable through the tunnel, installed as routes in the network area
  #       static_routes = ["192.0.2.0/24"]
  #
  #       # Point each tunnel at a different remote endpoint if the peer is redundant,
  #       # otherwise use the same address twice.
  #       tunnel1 = { remote_address = "198.51.100.10" }
  #       tunnel2 = { remote_address = "203.0.113.10" }
  #     }
  #   }
  # }
}

#####################
## FIREWALL POLICY ##
#####################

# Rules and NAT pushed to the OPNsense appliance through its API.
#
# Setup: export TF_VAR_firewall_admin_password='...' and run `tofu apply` twice. The
# first pass creates the appliance and derives the API key, the second pushes the
# policy. A provider config must resolve at plan time, so the key cannot be created
# and used in the same run.
#
# The API listens on the firewall's LAN address, so OpenTofu has to run inside the network area or site-to-site VPN
# That source must be in fw_management before the block rule below, or you lock yourself out
#
# firewall_config = {
#   aliases = {
#     fw_management = {
#       description = "May administer the firewall"
#       content     = ["10.0.0.0/16", "203.0.113.10/32"]
#     }
#     trusted_internal = {
#       description = "Network area plus VPN remote prefixes"
#       content     = ["10.0.0.0/16", "192.0.2.0/24"]
#     }
#   }
#
#   rules = {
#     # The image ships a FLOATING rule passing TCP/443 from any source to the firewall,
#     # so the GUI is public after a plain deploy. These rules lock it down
#     allow-webgui-from-management = {
#       sequence         = 10
#       action           = "pass"
#       interfaces       = [] # floating
#       protocol         = "TCP"
#       source_net       = "fw_management"
#       destination_net  = "(self)"
#       destination_port = "443"
#     }
#
#     block-webgui-from-everywhere-else = {
#       sequence         = 20
#       action           = "block"
#       interfaces       = [] # floating
#       protocol         = "TCP"
#       source_net       = "any"
#       destination_net  = "(self)"
#       destination_port = "443"
#       log              = true
#     }
#
#     allow-icmp-from-trusted = {
#       sequence   = 100
#       action     = "pass"
#       interfaces = ["lan"]
#       protocol   = "ICMP"
#       source_net = "trusted_internal"
#     }
#   }
#
#   # Without an entry the landing zones reach nothing, since their default route ends here.
#   # target_ip takes an address, an alias, or <int>ip.
#   outbound_nat = {
#     network-area-egress = {
#       sequence   = 100
#       interface  = "wan"
#       source_net = "10.0.0.0/16"
#       target_ip  = "wanip"
#     }

#     # Leave traffic untranslated, e.g. towards a site-to-site peer.
#     # no-nat-towards-onprem = {
#     #   sequence        = 10
#     #   interface       = "wan"
#     #   source_net      = "10.0.0.0/16"
#     #   destination_net = "192.0.2.0/24"
#     #   disable_nat     = true
#     # }
#   }
#
#   # Inbound NAT. Only rewrites the destination — unlike the GUI the provider adds no
#   # filter rule, so each forward needs its own pass rule above.
#   port_forwards = {
#     # web-to-dmz = {
#     #   source_net       = "198.51.100.0/24"
#     #   destination_net  = "wanip"
#     #   destination_port = "443"
#     #   target_ip        = "10.0.0.20"
#     #   target_port      = "8443" # omit to keep the destination port
#     # }
#   }
# }

############
## DEVOPS ##
############

# devops = {
#   git_flavor = "git-10"
#   allowed_network_ranges = ["0.0.0.0/0"]
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