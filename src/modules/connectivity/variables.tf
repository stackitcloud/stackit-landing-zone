variable "dns_zones" {
  type = map(object({
    dns_name         = string
    network_area_key = optional(string, "default")
    name             = optional(string, null)
    contact_email    = optional(string, null)
    type             = optional(string, "primary")
    acl              = optional(string, null)
    description      = optional(string, null)
    default_ttl      = optional(number, 3600)
  }))
  description = "Map of DNS zone keys to DNS zone configuration. Name defaults to dns_name if not set."
  default     = {}

  validation {
    condition     = alltrue([for zone in values(var.dns_zones) : contains(keys(var.network_areas), zone.network_area_key)])
    error_message = "Every dns_zones[*].network_area_key must identify an entry in network_areas."
  }
}

variable "firewall" {
  type = object({
    zone                     = string
    flavor                   = string
    name                     = string
    volume_performance_class = optional(string, "storage_premium_perf4")
    volume_size              = optional(number, 16)
    lan_network_range        = string
    wan_network_range        = string
    lan_ip                   = optional(string, null)
    wan_ip                   = optional(string, null)

    # Active/passive HA. Adds a second appliance in backup_zone plus a CARP virtual IP on
    # the LAN that becomes the platform next hop. CARP runs in unicast mode (OPNsense
    # >= 24.7) because the STACKIT fabric does not deliver advertisements sourced from
    # the shared virtual MAC — multicast CARP splits the brain (measured 2026-08-02).
    # Node-local settings are pushed by scripts/configure-ha.sh during apply.
    ha = optional(object({
      backup_zone   = string
      backup_name   = optional(string, null) # defaults to "<name>-backup"
      backup_lan_ip = optional(string, null) # defaults to the 6th address of lan_network_range
      backup_wan_ip = optional(string, null) # defaults to the 6th address of wan_network_range
      lan_vip       = optional(string, null) # defaults to the 7th address of lan_network_range
      vhid          = optional(number, 1)
    }), null)
  })
  description = "Firewall configuration. Set to null to skip firewall deployment (network area and routing are still created). lan_network_range and wan_network_range must be CIDRs within the network area range. lan_ip and wan_ip are optional; when omitted, the 5th address of the respective prefix is used (STACKIT reserves the first usable address as the gateway). Set ha for an active/passive CARP pair; the LAN VIP then replaces the primary's LAN IP as the platform next hop."
  default     = null

  validation {
    condition     = var.firewall == null || can(regex("^[a-z][0-9]+\\.[0-9]+$", var.firewall.flavor))
    error_message = "firewall.flavor must match STACKIT machine type format (e.g. c1.2). Validate available flavors with: stackit server machine-type list"
  }

  validation {
    condition     = var.firewall == null || try(var.firewall.ha, null) == null || var.firewall.ha.backup_zone != var.firewall.zone
    error_message = "firewall.ha.backup_zone must differ from firewall.zone — a backup appliance in the same availability zone shares its failure domain."
  }
}

variable "firewalls" {
  type = map(object({
    zone                     = string
    flavor                   = string
    name                     = string
    volume_performance_class = optional(string, "storage_premium_perf4")
    volume_size              = optional(number, 16)
    lan_network_range        = string
    wan_network_range        = string
    lan_ip                   = optional(string, null)
    wan_ip                   = optional(string, null)
    ha = optional(object({
      backup_zone   = string
      backup_name   = optional(string, null)
      backup_lan_ip = optional(string, null)
      backup_wan_ip = optional(string, null)
      lan_vip       = optional(string, null)
      vhid          = optional(number, 1)
    }), null)
  }))
  description = "Map of network area keys to firewall configuration. Use this for multiple network areas; keys must match network_areas."
  default     = null

  validation {
    condition     = var.firewalls == null || alltrue([for firewall in values(var.firewalls) : can(regex("^[a-z][0-9]+\\.[0-9]+$", firewall.flavor))])
    error_message = "Every firewalls[*].flavor must match STACKIT machine type format (e.g. c1.2)."
  }
}

variable "firewall_admin_endpoint" {
  type        = string
  description = "Base URL the HA configuration logs into the primary appliance with. Defaults to the primary's public IP, which is the only address reachable from outside the network area. Set it to the LAN address when OpenTofu runs inside the area, matching firewall_config.endpoint. The backup node is always configured over its own public IP: before HA exists it has no other reachable address."
  default     = null
}

variable "firewall_admin_username" {
  type        = string
  description = "Appliance login used to push the node-local HA settings. The STACKIT OPNsense image ships with root. Only used when firewall.ha is set."
  default     = "root"
}

variable "firewall_admin_password" {
  type        = string
  description = "Password of firewall_admin_username. Defaults to the password baked into the STACKIT OPNsense image. Only used when firewall.ha is set."
  default     = "STACKIT123!"
  sensitive   = true
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-hub-prod\"."
}

variable "network_areas" {
  type = map(object({
    name                  = optional(string, null)
    ranges                = list(string)
    transfer_network      = string
    max_prefix_length     = optional(number, 28)
    min_prefix_length     = optional(number, 24)
    default_prefix_length = optional(number, 28)
    default_nameservers   = optional(list(string), null)
  }))
  description = "Map of network area keys to configuration. Keys are stable references for DNS zones, landing zones, and outputs."
  default     = {}
}

# Removed variable "network_area_name" as it is no longer needed when using a list of network areas.

variable "organization_id" {
  type        = string
  description = "Organization ID, required for network area and route configuration."
}

variable "owner_email" {
  type        = string
  description = "Email address of the owner for the project. Required for STACKIT resource manager."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create. Falls back to naming_pattern if not set."
  default     = null
}

variable "region" {
  type        = string
  description = "STACKIT region the network area region is created in. Also selects the default resolvers when network_area.default_nameservers is unset."
  default     = "eu01"
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}

variable "vpn" {
  type = object({
    display_name = optional(string, null)
    plan_id      = optional(string, "p100")
    routing_type = optional(string, "ROUTE_BASED")
    availability_zones = object({
      tunnel1 = string
      tunnel2 = string
    })
    connections = optional(map(object({
      display_name   = optional(string, null)
      enabled        = optional(bool, true)
      local_subnets  = optional(list(string), null)
      remote_subnets = optional(list(string), null)
      static_routes  = optional(list(string), null)
      tunnel1 = object({
        remote_address = string
        peering = optional(object({
          local_address  = string
          remote_address = string
        }), null)
        phase1 = optional(object({
          encryption_algorithms = optional(list(string), ["aes256"])
          integrity_algorithms  = optional(list(string), ["sha2_384"])
          dh_groups             = optional(list(string), ["ecp384"])
          rekey_time            = optional(number, null)
        }), {})
        phase2 = optional(object({
          encryption_algorithms = optional(list(string), ["aes256"])
          integrity_algorithms  = optional(list(string), ["sha2_384"])
          dh_groups             = optional(list(string), ["ecp384"])
          rekey_time            = optional(number, null)
          dpd_action            = optional(string, null)
          start_action          = optional(string, null)
        }), {})
      })
      tunnel2 = object({
        remote_address = string
        peering = optional(object({
          local_address  = string
          remote_address = string
        }), null)
        phase1 = optional(object({
          encryption_algorithms = optional(list(string), ["aes256"])
          integrity_algorithms  = optional(list(string), ["sha2_384"])
          dh_groups             = optional(list(string), ["ecp384"])
          rekey_time            = optional(number, null)
        }), {})
        phase2 = optional(object({
          encryption_algorithms = optional(list(string), ["aes256"])
          integrity_algorithms  = optional(list(string), ["sha2_384"])
          dh_groups             = optional(list(string), ["ecp384"])
          rekey_time            = optional(number, null)
          dpd_action            = optional(string, null)
          start_action          = optional(string, null)
        }), {})
      })
    })), {})
  })
  # BGP_ROUTE_BASED is intentionally unsupported: it needs the gateway-level bgp attribute, and
  # stackitcloud/stackit (through 0.104.0) cannot convert an unknown value for that nested object,
  # which breaks `tofu validate` in CI. Re-add the bgp attribute once the provider handles it.
  description = "IPsec VPN gateway for the hub, attached to the network area through the connectivity project. Set to null to skip. The gateway is HA: it terminates two tunnels in separate availability zones, each with its own public IP. Connections are created in a second apply once the remote peer addresses are known. Supports POLICY_BASED and ROUTE_BASED routing."
  default     = null

  validation {
    condition     = var.vpn == null || contains(["POLICY_BASED", "ROUTE_BASED"], try(var.vpn.routing_type, ""))
    error_message = "vpn.routing_type must be one of POLICY_BASED, ROUTE_BASED. BGP_ROUTE_BASED is not supported by this module yet."
  }

  validation {
    condition     = var.vpn == null || can(regex("^p[0-9]+$", var.vpn.plan_id))
    error_message = "vpn.plan_id must be a STACKIT VPN plan identifier (e.g. p100, p500, p1000). List plans with: stackit curl https://vpn.api.eu01.stackit.cloud/v1beta1/regions/eu01/plans"
  }

  # Route-based gateways steer traffic over a virtual tunnel interface, so the remote prefixes
  # have to be installed as static routes. Policy-based gateways derive them from the SA selectors.
  validation {
    condition = var.vpn == null || var.vpn.routing_type != "ROUTE_BASED" || alltrue([
      for c in values(var.vpn.connections) : c.static_routes != null && length(coalesce(c.static_routes, [])) > 0
    ])
    error_message = "vpn.connections[*].static_routes is mandatory when vpn.routing_type is ROUTE_BASED."
  }

  validation {
    condition = var.vpn == null || var.vpn.routing_type != "POLICY_BASED" || alltrue([
      for c in values(var.vpn.connections) :
      length(coalesce(c.local_subnets, [])) > 0 && length(coalesce(c.remote_subnets, [])) > 0
    ])
    error_message = "vpn.connections[*].local_subnets and remote_subnets are mandatory when vpn.routing_type is POLICY_BASED."
  }
}

variable "vpn_pre_shared_keys" {
  type = map(object({
    tunnel1 = string
    tunnel2 = string
  }))
  description = "Pre-shared keys per VPN connection key, one per tunnel. Kept separate from var.vpn so the connection topology stays committable; supply through TF_VAR_vpn_pre_shared_keys or a gitignored tfvars file. Minimum 20 characters."
  default     = {}
  sensitive   = true

  validation {
    condition = var.vpn == null || alltrue([
      for k in keys(var.vpn.connections) : contains(keys(var.vpn_pre_shared_keys), k)
    ])
    error_message = "Every key in vpn.connections needs a matching entry in vpn_pre_shared_keys."
  }

  validation {
    condition = alltrue([
      for psk in values(var.vpn_pre_shared_keys) : length(psk.tunnel1) >= 20 && length(psk.tunnel2) >= 20
    ])
    error_message = "Pre-shared keys must be at least 20 characters long."
  }
}
