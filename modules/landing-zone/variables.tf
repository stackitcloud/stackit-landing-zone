variable "custom_roles" {
  type = list(object({
    name        = string
    description = string
    permissions = list(string)
  }))
  description = "List of custom roles to create for the project."
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-net-prod\"."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
  default     = null
}

variable "network_prefix_length" {
  type        = number
  description = "CIDR block prefix length for the project's network range."
  default     = null
}

variable "owner_email" {
  type        = string
  description = "Email address of the project owner. Required for project creation."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
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