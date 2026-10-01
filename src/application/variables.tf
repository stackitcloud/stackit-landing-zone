variable "platform_contract" {
  description = "Verified published platform references, supplied by the trusted runner. No remote-state access."
  type = object({
    schema_version  = number
    tenant_id       = string
    revision        = string
    organization_id = string
    targets = map(object({
      folder_id            = string
      region               = string
      corporate            = bool
      network_area_id      = optional(string, null)
      firewall_next_hop_ip = optional(string, null)
      ipv4_nameservers     = optional(list(string), null)
    }))
  })
  validation {
    condition     = var.platform_contract.schema_version == 1
    error_message = "Unsupported platform contract version."
  }
  validation {
    condition = alltrue([for target in values(var.platform_contract.targets) :
      contains(["eu01", "eu02"], target.region) && (!target.corporate || target.network_area_id != null)
    ])
    error_message = "Targets need a supported region and corporate targets need an SNA reference."
  }
}
variable "application" {
  description = "Server-compiled application instance. Owner and services must not come from arbitrary form fields."
  type = object({
    tenant_id              = string
    instance_id            = string
    platform_revision      = string
    template_id            = string
    template_version       = number
    name                   = string
    env                    = optional(string, null)
    owner_email            = string
    target_key             = string
    secretsmanager_enabled = bool
    observability = object({
      enabled       = bool
      plan_name     = string
      acl           = list(string)
      access_source = optional(string, "explicit-cidrs")
    })
  })
  validation {
    condition     = var.application.env == null ? true : can(regex("^[a-z][a-z0-9-]{0,15}$", var.application.env))
    error_message = "Application env must contain 1-16 lowercase letters, digits or hyphens and start with a letter. Omit it to preserve legacy resource names."
  }
  validation {
    condition     = contains(["explicit-cidrs", "project-network"], var.application.observability.access_source)
    error_message = "Observability access_source must be explicit-cidrs or project-network."
  }
  validation {
    condition     = var.application.observability.access_source != "project-network" || (var.application.observability.enabled && length(var.application.observability.acl) == 0)
    error_message = "A project-network binding requires enabled Observability and cannot be combined with explicit ACL CIDRs. It remains non-executable until the effective egress path is qualified."
  }
  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.application.instance_id))
    error_message = "Instance ID must be a server-issued UUID."
  }
}
