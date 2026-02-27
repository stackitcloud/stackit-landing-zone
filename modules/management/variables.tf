variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
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

variable "allowed_network_ranges" {
  type        = list(string)
  description = "List of allowed network ranges for Git instance ACL."
  default     = ["0.0.0.0/0"]
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
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