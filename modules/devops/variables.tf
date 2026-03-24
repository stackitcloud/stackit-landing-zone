variable "allowed_network_ranges" {
  type        = list(string)
  description = "List of allowed network ranges for Git instance ACL."
  default     = ["0.0.0.0/0"]
}

variable "company_name" {
  type        = string
  description = "Name of the company folder to create."
}

variable "git_flavor" {
  type        = string
  description = "The flavor of the Git instance."
  default     = null # "git-100", git-10

  validation {
    condition     = var.git_flavor == null || can(regex("^git-[0-9]+$", var.git_flavor))
    error_message = "git_flavor must match STACKIT Git flavor format (e.g. git-10 or git-100). Validate available flavors in the STACKIT Git API documentation."
  }
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
  default     = null
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

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-net-prod\"."
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}