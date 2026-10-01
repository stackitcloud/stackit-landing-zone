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
    owner_email            = string
    target_key             = string
    secretsmanager_enabled = bool
    observability = object({
      enabled   = bool
      plan_name = string
      acl       = list(string)
    })
  })
  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.application.instance_id))
    error_message = "Instance ID must be a server-issued UUID."
  }
}
