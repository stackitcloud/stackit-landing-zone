variable "custom_roles" {
  type = list(object({
    name        = string
    description = string
    permissions = list(string)
  }))
  description = "List of custom roles to create at the organization level."
  default     = []
}

variable "rm_folders" {
  type = map(object({
    name          = string
    owner_emails  = optional(list(string), [])
    reader_emails = optional(list(string), [])
  }))
  description = "Map of folder keys to folder configuration. Each folder has a display name and optional lists of owner and reader subjects."
  default = {
    platform = {
      name          = "Platform"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_corporate = {
      name          = "Landing Zones - Corporate"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_public = {
      name          = "Landing Zones - Public"
      owner_emails  = []
      reader_emails = []
    }
    sandbox = {
      name          = "Sandboxes"
      owner_emails  = []
      reader_emails = []
    }
  }
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "organization_auditors" {
  type        = list(string)
  description = "List of organization role assignments for organization auditors."
  default     = []
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}

variable "organization_owners" {
  type        = list(string)
  description = "List of organization role assignments for organization owners."
  default     = []
}

variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}