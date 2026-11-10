variable "credential_generation" {
  type        = string
  description = "Change deliberately to rotate the 90-day project provisioning key."
  default     = "initial"
}

variable "existing_project_container_id" {
  type        = string
  description = "Existing operator-project container ID to import; null creates a new project."
  default     = null
}

variable "operator_service_account_email" {
  type        = string
  description = "Central provisioning service account; its private key is supplied externally."
}

variable "owner_email" {
  type        = string
  description = "Central initial project owner; never a test-user identity."
}

variable "parent_container_id" {
  type        = string
  description = "Explicit organization or folder containing the operator project."
}

variable "project_name" {
  type        = string
  description = "Exact operator project name."
  validation {
    condition     = contains(["Landing Zone Configurator - Dev", "Landing Zone Configurator - Prod"], var.project_name)
    error_message = "Select an explicit Configurator operator project."
  }
}

variable "region" {
  type        = string
  description = "Operator region."
  default     = "eu01"
}
