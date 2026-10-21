variable "bucket_naming" {
  type        = string
  description = "Management bucket naming scheme: legacy preserves existing names; project-id includes the complete management project UUID for STACKIT-wide uniqueness. Changing this for existing buckets requires a reviewed migration."
  default     = "project-id"

  validation {
    condition     = contains(["legacy", "project-id"], var.bucket_naming)
    error_message = "Bucket naming must be legacy or project-id."
  }
}

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
    logs_retention_days                    = optional(number)
    traces_retention_days                  = optional(number)
    metrics_retention_days                 = optional(number)
    metrics_retention_days_5m_downsampling = optional(number)
    metrics_retention_days_1h_downsampling = optional(number)
  })
  description = "Observability instance configuration. Omitted or null retention uses the service plan defaults. Monitoring plans require both retention fields to be omitted or null. Set to null to skip observability deployment."
  default     = null

  validation {
    condition = var.observability == null ? true : (
      !startswith(var.observability.plan_name, "Observability-Monitoring-") ||
      (var.observability.logs_retention_days == null && var.observability.traces_retention_days == null)
    )
    error_message = "Monitoring plans do not support logs or traces retention. Omit logs_retention_days and traces_retention_days or set them to null."
  }

  validation {
    condition = var.observability == null ? true : (
      !can(regex("^Observability-(Frontend|Metrics-?Endpoint)", var.observability.plan_name)) ||
      alltrue([for value in [var.observability.logs_retention_days, var.observability.traces_retention_days, var.observability.metrics_retention_days, var.observability.metrics_retention_days_5m_downsampling, var.observability.metrics_retention_days_1h_downsampling] : value == null])
    )
    error_message = "Frontend and MetricsEndpoint plans do not support retention overrides. Omit all retention fields or set them to null."
  }

  validation {
    condition = var.observability == null ? true : alltrue([
      for value in [var.observability.logs_retention_days, var.observability.traces_retention_days] : value == null ? true : value >= 1 && value <= 30 && floor(value) == value
    ])
    error_message = "Logs and traces retention must be omitted, null or a whole number from 1 to 30 days."
  }

  validation {
    condition = var.observability == null ? true : alltrue([
      for value in [var.observability.metrics_retention_days, var.observability.metrics_retention_days_5m_downsampling, var.observability.metrics_retention_days_1h_downsampling] : value == null ? true : value >= 1 && value <= 780 && floor(value) == value
    ])
    error_message = "Metrics retention must be omitted, null or a whole number from 1 to 780 days."
  }
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}

variable "federated_identity_providers" {
  type = list(object({
    name   = string
    issuer = string
    assertions = list(object({
      item     = string
      operator = string
      value    = string
    }))
  }))
  description = "List of federated identity providers to configure for the management service account."
  default     = []
}

variable "audit_logs" {
  type = object({
    retention_days = optional(number, 180)
    acl            = optional(list(string), null)
    s3_object_lock = optional(bool, true)
    link_scopes = optional(list(object({
      resource_type = string # organization, folder, project
      resource_id   = string
    })), null)
  })
  description = "Audit logs configuration. The router forwards to two destinations: OTLP into the Logs instance for querying, and S3 into the audit bucket for long-term archive. retention_days applies to both, driving the Logs instance retention and, when s3_object_lock is enabled, the archive bucket's default retention. link_scopes defaults to a single organization-wide link; set it to attach individual folders or projects instead."
  default     = null

  validation {
    condition = alltrue([
      for scope in try(var.audit_logs.link_scopes, []) == null ? [] : try(var.audit_logs.link_scopes, []) :
      contains(["organization", "folder", "project"], scope.resource_type)
    ])
    error_message = "audit_logs.link_scopes[*].resource_type must be one of: organization, folder, project."
  }

  validation {
    condition     = try(!var.audit_logs.s3_object_lock || (var.audit_logs.retention_days >= 1 && var.audit_logs.retention_days <= 365), true)
    error_message = "audit_logs.retention_days must be between 1 and 365 when s3_object_lock is enabled, since that is the STACKIT object storage maximum."
  }
}
