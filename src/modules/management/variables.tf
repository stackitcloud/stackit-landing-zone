variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
  default     = null
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-hub-prod\"."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}

variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "observability" {
  type = object({
    plan_name                              = optional(string, "Observability-Starter-EU01")
    acl                                    = optional(list(string), [])
    logs_retention_days                    = optional(number, 30)
    traces_retention_days                  = optional(number, 30)
    metrics_retention_days                 = optional(number, 90)
    metrics_retention_days_5m_downsampling = optional(number, 90)
    metrics_retention_days_1h_downsampling = optional(number, 90)
  })
  description = "Observability instance configuration. Set to null to skip observability deployment."
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