variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}

variable "company_name" {
  type        = string
  description = "Name of the company folder to create."
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

variable "platform_admins" {
  type        = list(string)
  description = "List of platform administrators with elevated permissions."
  default     = []
}

variable "landing_zone_admins" {
  type        = list(string)
  description = "List of landing zone administrators with elevated permissions."
  default     = []
}