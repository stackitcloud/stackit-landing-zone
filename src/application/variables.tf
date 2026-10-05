variable "application" {
  type = object({
    configurator_execution = optional(bool, false)
    tenant_id              = string
    instance_id            = string
    platform_revision      = string
    template_id            = string
    template_version       = number
    name                   = string
    env                    = optional(string, null)
    owner_email            = string
    target_key             = string
    network_enabled        = optional(bool, false)
    network_prefix_length  = optional(number, null)
    secretsmanager_enabled = bool
    custom_roles = optional(list(object({
      name        = string
      description = string
      permissions = list(string)
    })), [])
    role_assignments = optional(list(object({
      role    = string
      subject = string
    })), [])
    observability = object({
      enabled       = bool
      plan_name     = string
      acl           = list(string)
      access_source = optional(string, "explicit-cidrs")
    })
  })
  description = "Resolved application instance supplied manually or by the Configurator. Identity and deployment authorization are enforced by the caller's IAM permissions."

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
    error_message = "Instance ID must be a stable UUID allocated once for this application, manually or by the Configurator."
  }
}

variable "platform_contract" {
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
  description = "Reviewed non-secret platform references supplied as a CLI artifact or by the Configurator. No remote-state access."

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
