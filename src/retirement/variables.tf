variable "organization_auditors" {
  type        = list(string)
  description = "Original organization auditors; retained during retirement because they may be shared."
  default     = []
}

variable "organization_id" {
  type        = string
  description = "Original organization ID; must match the captured State and inventory."
}

variable "organization_owners" {
  type        = list(string)
  description = "Original organization owners; retain cleanup access until explicitly handed over."
  default     = []
}

variable "owner_email" {
  type        = string
  description = "Original governance owner; do not substitute a different owner during retirement."
}

variable "region" {
  type        = string
  description = "Original default STACKIT region."
  default     = "eu01"
}

variable "retirement_phase" {
  type        = string
  description = "Reviewed deletion phase: remove projects while retaining folders, then finalize empty folders."

  validation {
    condition     = contains(["remove_projects", "finalize_folders"], var.retirement_phase)
    error_message = "Choose remove_projects or finalize_folders explicitly."
  }
}

variable "rm_folder_parent_id" {
  type        = string
  description = "Unchanged original parent container ID, or null for the organization."
  default     = null
}

variable "rm_folders" {
  type = map(object({
    name          = string
    description   = optional(string, null)
    owner_emails  = optional(list(string), [])
    reader_emails = optional(list(string), [])
  }))
  description = "Exact original folder keys, names and assignments; required even during finalization for inventory review."
}
