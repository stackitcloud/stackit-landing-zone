variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}

variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
}

variable "project_code" {
  type        = string
  description = "Optional project code for the STACKIT project."
}

variable "company_name" {
  type        = string
  description = "Name of the company folder to create."
}

variable "company_code" {
  type        = string
  description = "Company code used in resource naming conventions."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}

variable "organization_owners" {
  type        = list(string)
  description = "List of organization role assignments for organization owners."
  default     = []
}

variable "organization_auditors" {
  type        = list(string)
  description = "List of organization role assignments for organization auditors."
  default     = []
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

variable "allowed_network_ranges" {
  type        = list(string)
  description = "List of allowed network ranges for Git instance ACL."
  default     = ["0.0.0.0/0"]
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
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

variable "env" {
  type        = string
  description = "Environment identifier (e.g., dev, staging, prod) used in resource naming conventions."
  default     = "dev"
}