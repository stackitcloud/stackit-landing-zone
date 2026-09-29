variable "project_id" {
  type        = string
  description = "Existing STACKIT operator project; this root does not create customer projects."
  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.project_id))
    error_message = "project_id must be a UUID."
  }
}

variable "region" {
  type        = string
  description = "Explicitly selected STACKIT deployment region."
  validation {
    condition     = contains(["eu01", "eu02"], var.region)
    error_message = "Use a supported region: eu01 or eu02."
  }
}

variable "name_prefix" {
  type        = string
  description = "Stable environment-specific naming prefix."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,29}[a-z0-9]$", var.name_prefix))
    error_message = "Use 4-31 lowercase letters, numbers or hyphens, starting with a letter and ending with a letter or number."
  }
}

variable "state_credential_expiration" {
  type        = string
  description = "RFC3339 expiry of the operator backend credential; rotate before this date."
  validation {
    condition     = can(formatdate("YYYY", var.state_credential_expiration))
    error_message = "Supply an explicit RFC3339 expiration timestamp."
  }
}
