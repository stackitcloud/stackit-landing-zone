variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-net-prod\"."
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
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

variable "dns_zones" {
  type = map(object({
    name          = string
    dns_name      = string
    contact_email = optional(string, null)
    type          = optional(string, "primary")
    acl           = optional(string, null)
    description   = optional(string, null)
    default_ttl   = optional(number, 3600)
  }))
  description = "Map of DNS zone keys to DNS zone configuration."
  default     = {}
}