variable "firewall_flavor" {
  type        = string
  description = "Firewall VM Flavor"
  default     = "c1.2"

  validation {
    condition     = can(regex("^[a-z][0-9]+\\.[0-9]+$", var.firewall_flavor))
    error_message = "firewall_flavor must match STACKIT machine type format (e.g. c1.2). Validate available flavors with: stackit server machine-type list"
  }
}

variable "firewall_ip" {
  type        = string
  description = "IP address of the firewall"
  default     = "10.0.0.220"
}

variable "firewall_zone" {
  type        = string
  description = "STACKIT Availability Zone"
  default     = "eu01-m"
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-net-prod\"."
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
}

variable "organization_id" {
  type        = string
  description = "Organization ID, required for network area route configuration."
}

variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
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

variable "vnet_range" {
  type        = string
  description = "CIDR range for the project VNet. Required if network is enabled."
  default     = "10.0.0.0/24"
}
