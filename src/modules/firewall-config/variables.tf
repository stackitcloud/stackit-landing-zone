variable "category_name" {
  type        = string
  description = "OPNsense category every object created by this module is tagged with, so managed objects are recognisable in the GUI."
  default     = "landing-zone"
}

variable "endpoint" {
  type        = string
  description = "Base URL of the OPNsense API on the primary node, e.g. https://10.0.2.4. Only used by the HA sync trigger; the provider itself is configured in the root module."
  default     = null
}

variable "ha_sync" {
  type        = bool
  description = "Push this policy to the HA peer after every change (POST /api/core/hasync_status/restart_all on the primary). Required for the active/passive CARP pair: OPNsense's own config sync never fires on API writes, so without it the backup runs an empty ruleset. Enabled automatically when connectivity.firewall.ha is set."
  default     = false
}

variable "admin_username" {
  type        = string
  description = "Appliance login used by the HA sync trigger. Only used when ha_sync is set."
  default     = "root"
}

variable "admin_password" {
  type        = string
  description = "Password of admin_username, used by the HA sync trigger. Defaults to the password baked into the STACKIT OPNsense image. Only used when ha_sync is set."
  default     = "STACKIT123!"
  sensitive   = true
}

variable "aliases" {
  type = map(object({
    type        = optional(string, "network")
    enabled     = optional(bool, true)
    description = optional(string, null)
    content     = optional(list(string), [])
    update_freq = optional(number, null)
    stats       = optional(bool, false)
  }))
  description = "Firewall aliases keyed by alias name. Reference an alias from a rule, route or NAT entry by using its key wherever a network is expected. type = \"host\" also accepts FQDNs, which the appliance re-resolves periodically."
  default     = {}

  validation {
    condition = alltrue([
      for a in values(var.aliases) :
      contains(["host", "network", "port", "url", "urltable", "urljson", "geoip", "asn", "networkgroup", "mac", "external"], a.type)
    ])
    error_message = "aliases[*].type must be one of host, network, port, url, urltable, urljson, geoip, asn, networkgroup, mac, external."
  }

  # OPNsense refuses a urltable without a refresh interval, and the API error it returns
  # for it does not name the field.
  validation {
    condition = alltrue([
      for a in values(var.aliases) : a.type != "urltable" || a.update_freq != null
    ])
    error_message = "aliases[*].update_freq is required when type is urltable. It is expressed in days, so 1.25 means every 30 hours."
  }
}

variable "routes" {
  type = map(object({
    enabled     = optional(bool, true)
    network     = string
    gateway     = string
    description = optional(string, null)
  }))
  description = "Static routes keyed by name. gateway must name a gateway that exists on the appliance; the STACKIT image ships LAN_DHCP and WAN_DHCP."
  default     = {}
}

variable "outbound_nat" {
  type = map(object({
    sequence        = optional(number, 200)
    enabled         = optional(bool, true)
    interface       = optional(string, "wan")
    protocol        = optional(string, "any")
    ip_protocol     = optional(string, "inet")
    source_net      = optional(string, "any")
    destination_net = optional(string, "any")
    target_ip       = optional(string, "wanip")
    disable_nat     = optional(bool, false)
    log             = optional(bool, false)
    description     = optional(string, null)
  }))
  description = "Additional outbound NAT rules keyed by name. target_ip accepts an address, an alias, or <int>ip such as wanip."
  default     = {}
}

variable "port_forwards" {
  type = map(object({
    sequence         = optional(number, 100)
    enabled          = optional(bool, true)
    interfaces       = optional(list(string), ["wan"])
    protocol         = optional(string, "TCP")
    ip_protocol      = optional(string, "inet")
    source_net       = optional(string, "any")
    destination_net  = optional(string, "wanip")
    destination_port = string
    target_ip        = string
    target_port      = optional(string, null)
    nat_reflection   = optional(string, "default")
    log              = optional(bool, true)
    description      = optional(string, null)
  }))
  description = "Inbound port forwards from the internet keyed by name. Every entry punches a hole through the WAN, so keep the list short and set source_net where possible."
  default     = {}
}

variable "rules" {
  type = map(object({
    sequence           = optional(number, 100)
    enabled            = optional(bool, true)
    action             = optional(string, "pass")
    direction          = optional(string, "in")
    interfaces         = optional(list(string), ["lan"])
    protocol           = optional(string, "any")
    ip_protocol        = optional(string, "inet")
    quick              = optional(bool, true)
    source_net         = optional(string, "any")
    source_port        = optional(string, null)
    source_invert      = optional(bool, false)
    destination_net    = optional(string, "any")
    destination_port   = optional(string, null)
    destination_invert = optional(bool, false)
    log                = optional(bool, false)
    description        = optional(string, null)
  }))
  description = "Firewall filter rules keyed by name. An empty interfaces list creates a floating rule, which OPNsense evaluates before interface-bound rules."
  default     = {}

  validation {
    condition = alltrue([
      for r in values(var.rules) : contains(["pass", "block", "reject"], r.action)
    ])
    error_message = "rules[*].action must be one of pass, block, reject."
  }

  validation {
    condition = alltrue([
      for r in values(var.rules) : contains(["in", "out"], r.direction)
    ])
    error_message = "rules[*].direction must be in or out."
  }
}

