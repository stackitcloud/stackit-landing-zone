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

    # Resolvers handed to every network in the area. Left out, the STACKIT resolvers of the configured region apply
    # default_nameservers = ["192.214.161.53", "213.17.17.17", "188.34.111.111"]
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

# Rules, routes and NAT pushed to the OPNsense appliance through its API.
#
# The firewall needs to exist before configuring it. Bootstrapping is described here:
# docs/getting-started.md#configure-opnsense-firewall 
#
# firewall_config = {
#   endpoint = "https://198.51.100.20" # check bootstrap docs
#
#   aliases = {
#     # Everything routed inside the network area: all landing zones plus the appliance's
#     # own LAN and WAN prefixes. Keep in sync with connectivity.network_area.ranges.
#     network_area = {
#       description = "All prefixes routed inside the STACKIT network area"
#       content     = ["10.0.0.0/16"]
#     }
#
#     # Sources allowed to reach the web GUI and the API. The whole network area is the
#     # loosest setting that still keeps the GUI off the public internet. Narrow it to the
#     # subnet the OpenTofu runner and the operators sit in once that is known.
#     fw_management = {
#       description = "May administer the firewall"
#       content     = ["10.0.0.0/16", "203.0.113.10/32"] # check bootstrap docs
#     }
#
#     # Resolvers handed to the landing zones through network_area.default_nameservers.
#     # The landing zones reach them through this appliance, so they need an explicit rule
#     # as soon as the blanket internet rule is switched off.
#     platform_dns = {
#       type        = "host"
#       description = "Resolvers the landing zones are pointed at"
#       content     = ["192.214.161.53", "213.17.17.17", "188.34.111.111"] # STACKIT resolvers, eu01
#     }
#
#     # Example of a domain based allow rule. A host alias accepts FQDNs and OPNsense re-resolves them on a timer
#     ubuntu_update_servers = {
#       type        = "host"
#       description = "Canonical archive, security and changelog mirrors"
#       content = [
#         "archive.ubuntu.com",
#         "security.ubuntu.com",
#         "changelogs.ubuntu.com",
#         "esm.ubuntu.com",
#       ]
#     }
#
#     ubuntu_update_ports = {
#       type        = "port"
#       description = "Ports the Ubuntu mirrors are served on"
#       content     = ["80", "443"]
#     }
#   }
#
#   # Both appliance interfaces are DHCP clients on a /28 and the default route leaves
#   # through WAN, so without this the landing zone prefixes are only reachable the long way
#   # round: spoke bound traffic would be sent to the WAN gateway and re-enter the network
#   # area from the outside. That also drags LZ-to-LZ traffic through the WAN interface,
#   # where the egress NAT rule would rewrite it and hide the real source address.
#   routes = {
#     network-area-via-lan = {
#       network     = "10.0.0.0/16"
#       gateway     = "LAN_DHCP"
#       description = "Landing zones sit behind the LAN interface"
#     }
#   }
#
#   rules = {
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
#     # Block everything else to the web GUI since the firewall image allows all traffic by default
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

#     allow-lz-to-dns = {
#       sequence         = 100
#       action           = "pass"
#       interfaces       = ["lan"]
#       protocol         = "TCP/UDP"
#       source_net       = "network_area"
#       destination_net  = "platform_dns"
#       destination_port = "53"
#     }
#
#     allow-lz-to-lz-https = {
#       sequence         = 110
#       action           = "pass"
#       interfaces       = ["lan"]
#       protocol         = "TCP"
#       source_net       = "network_area"
#       destination_net  = "network_area"
#       destination_port = "443"
#     }
#
#     allow-lz-to-lz-icmp = {
#       sequence        = 120
#       action          = "pass"
#       interfaces      = ["lan"]
#       protocol        = "ICMP"
#       source_net      = "network_area"
#       destination_net = "network_area"
#     }
#
#     block-lz-to-lz = {
#       sequence        = 130
#       action          = "block"
#       interfaces      = ["lan"]
#       protocol        = "any"
#       source_net      = "network_area"
#       destination_net = "network_area"
#       log             = true
#     }
#
#     allow-lz-to-ubuntu-updates = {
#       sequence         = 160
#       action           = "pass"
#       interfaces       = ["lan"]
#       protocol         = "TCP"
#       source_net       = "network_area"
#       destination_net  = "ubuntu_update_servers"
#       destination_port = "ubuntu_update_ports"
#     }
#
#     allow-lz-to-internet = {
#       sequence        = 200
#       action          = "pass"
#       interfaces      = ["lan"]
#       protocol        = "any"
#       source_net      = "network_area"
#       destination_net = "any"
#       description     = "Blanket egress. Disable this to switch to default-deny."
#     }
#   }
#
#   # Without an entry the landing zones reach nothing, since their default route ends here.
#   # target_ip takes an address, an alias, or <int>ip. These are applied regardless of the
#   # appliance's Outbound NAT mode, which the API cannot change and which stays automatic.
#   outbound_nat = {
#     no-nat-inside-network-area = {
#       sequence        = 10
#       interface       = "wan"
#       source_net      = "network_area"
#       destination_net = "network_area"
#       disable_nat     = true
#     }
#
#     # The public IP is bound to the WAN interface address, so egress has to be translated
#     # to exactly that address for the platform to reach the internet at all.
#     network-area-egress = {
#       sequence   = 100
#       interface  = "wan"
#       source_net = "network_area"
#       target_ip  = "wanip"
#     }
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