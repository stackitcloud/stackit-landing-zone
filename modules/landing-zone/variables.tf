variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
}

variable "project_code" {
  type        = string
  description = "Optional project code for the STACKIT project."
}

variable "company_code" {
  type        = string
  description = "Company code used in resource naming conventions."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "owner_email" {
  type        = string
  description = "Email address of the project owner. Required for project creation."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
  default     = null
}

variable "env" {
  type        = string
  description = "Environment identifier (e.g., dev, staging, prod) used in resource naming conventions."
  default     = "dev"
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}

variable "network_prefix_length" {
  type        = number
  description = "CIDR block prefix length for the project's network range."
  default     = null
}

variable "kubernetes_clusters" {
  type = map(object({
    kubernetes_version                   = string
    enable_kubernetes_version_updates    = optional(bool, true)
    enable_machine_image_version_updates = optional(bool, true)
    hibernations = optional(list(object({
      start    = string
      end      = string
      timezone = optional(string, "Europe/Berlin")
    })), [])
    node_pools = list(object({
      name               = string
      machine_type       = string
      availability_zones = list(string)
      os_version_min     = optional(string)
      minimum            = number
      maximum            = number
      max_surge          = optional(number)
      max_unavailable    = optional(number)
      labels             = optional(map(string))
      taints = optional(list(object({
        key    = string
        value  = string
        effect = string
      })))
    }))
    extensions = optional(object({
      acl = optional(object({
        allowed_cidrs = list(string)
        enabled       = bool
      }))
      dns = optional(object({
        enabled = bool
        zones   = optional(list(string))
      }))
      observability = optional(object({
        enabled     = bool
        instance_id = optional(string)
      }))
    }))
  }))
  description = "Map of Kubernetes clusters to create. The key is used as a suffix for the cluster name."
  default     = {}
}

variable "custom_roles" {
  type = list(object({
    name        = string
    description = string
    permissions = list(string)
  }))
  description = "List of custom roles to create for the project."
}