###############
## VARIABLES ##
###############

variable "owner_email" {
  type        = string
  description = "Email address of the owner. Required for STACKIT resource manager."
}

variable "company_name" {
  type        = string
  description = "Name of the company."
}

variable "company_code" {
  type        = string
  description = "Company code used in resource naming conventions."
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root organization."
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "organization_owners" {
  type        = list(string)
  description = "List of organization owners."
  default     = []
}

variable "organization_auditors" {
  type        = list(string)
  description = "List of organization auditors."
  default     = []
}

variable "platform_admins" {
  type        = list(string)
  description = "List of platform administrators."
  default     = []
}

variable "sandboxes" {
  type = list(object({
    project_name        = string
    owner_emails        = optional(list(string))
    project_owner_email = string
  }))
  description = "List of sandboxes to create."
  default     = []
}

variable "landing_zones" {
  type = map(object({
    project_code = string
    owner_email  = string
    env          = optional(string, "dev")
    role_assignments = optional(list(object({
      role    = string
      subject = string
    })), [])
    network_prefix_length = optional(number, null)
    custom_roles = optional(list(object({
      name        = string
      description = string
      permissions = list(string)
    })), [])
  }))
  description = "Map of landing zones to create (public, without network area)."
  default     = {}
}