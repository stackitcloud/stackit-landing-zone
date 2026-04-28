variable "dns_zones" {
  type = map(object({
    dns_name      = string
    name          = optional(string, null)
    contact_email = optional(string, null)
    type          = optional(string, "primary")
    acl           = optional(string, null)
    description   = optional(string, null)
    default_ttl   = optional(number, 3600)
  }))
  description = "Map of DNS zone keys to DNS zone configuration. Name defaults to dns_name if not set."
  default     = {}
}

variable "firewall" {
  type = object({
    zone       = string
    flavor     = string
    lan_ip     = string
    lan_prefix = string
    wan_ip     = string
    wan_prefix = string
  })
  description = "pfSense firewall configuration. Set to null to skip firewall deployment (network area and routing are still created). lan_prefix and wan_prefix must be CIDRs within the network area range that contain the respective IPs."
  default     = null

  validation {
    condition     = var.firewall == null || can(regex("^[a-z][0-9]+\\.[0-9]+$", var.firewall.flavor))
    error_message = "firewall.flavor must match STACKIT machine type format (e.g. c1.2). Validate available flavors with: stackit server machine-type list"
  }
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

variable "network_area" {
  type = object({
    ranges                = list(string)
    transfer_network      = string
    min_prefix_length     = optional(number, 24)
    max_prefix_length     = optional(number, 28)
    default_prefix_length = optional(number, 28)
    default_nameservers   = optional(list(string), ["1.0.0.1", "1.1.1.1"])
  })
  description = "Network area configuration including IP ranges, transfer network, and prefix length settings."
}

variable "network_area_name" {
  type        = string
  description = "Name of the network area to create for this region."
  default     = null
}

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

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}