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

variable "cf_platform_id" {
  type        = string
  description = "Explicitly chosen CF foundation ID from the project-specific platform catalog."
}

variable "cf_quota_id" {
  type        = string
  description = "Explicitly chosen quota ID for this CF foundation."
}

variable "database_access_cidrs" {
  type        = set(string)
  description = "Explicit source networks allowed to access PostgreSQL; not dedicated CF egress IPs."
  validation {
    condition = length(var.database_access_cidrs) > 0 && alltrue([
      for cidr in var.database_access_cidrs : can(cidrhost(cidr, 0)) && try(tonumber(split("/", cidr)[1]) > 0, false)
    ])
    error_message = "Supply explicit valid access CIDRs; unrestricted internet access is not accepted."
  }
}

variable "secrets_access_cidrs" {
  type        = set(string)
  description = "Explicit source networks allowed to access Secrets Manager; validate connectivity separately."
  validation {
    condition = length(var.secrets_access_cidrs) > 0 && alltrue([
      for cidr in var.secrets_access_cidrs : can(cidrhost(cidr, 0)) && try(tonumber(split("/", cidr)[1]) > 0, false)
    ])
    error_message = "Supply explicit valid access CIDRs; unrestricted internet access is not accepted."
  }
}

variable "database" {
  type = object({
    flavor_id       = string
    version         = string
    storage_class   = string
    storage_size_gb = number
    backup_schedule = string
    retention_days  = number
  })
  description = "Explicitly selected PostgreSQL Flex plan, version, storage and backup settings."
  validation {
    condition     = var.database.storage_size_gb > 0 && var.database.retention_days >= 32 && var.database.retention_days <= 90
    error_message = "Storage must be positive and backup retention between 32 and 90 days."
  }
}

variable "credential_generation" {
  type        = string
  description = "Increment intentionally to rotate supported platform credentials, followed by binding updates."
  default     = "initial"
}
