#############
## GENERAL ##
#############

variable "owner_email" {
  type        = string
  description = "Email address of the owner. Required for STACKIT resource manager."
}

variable "company_name" {
  type        = string
  description = "Name of the company."
}

variable "company_code" {
  type        = string
  description = "Company code used in resource naming conventions."
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root organization."
}

variable "rm_folder_parent_id" {
  type        = string
  description = "ID of the parent folder under which the resource manager folders will be created. If not provided, the resource manager folders will be created under the organization."
  default     = null
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "organization_owners" {
  type        = list(string)
  description = "List of organization owners."
  default     = []
}

variable "organization_auditors" {
  type        = list(string)
  description = "List of organization auditors."
  default     = []
}

variable "devops" {
  type = object({
    git_flavor             = optional(string, null)
    allowed_network_ranges = optional(list(string), ["0.0.0.0/0"])
  })
  description = "DevOps module configuration. Set to null to skip deployment."
  default     = null
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
  description = "Observability instance configuration for the management module. Set to null to skip observability deployment."
  default     = null
}

variable "rm_folders" {
  type = map(object({
    name          = string
    description   = optional(string, null)
    owner_emails  = list(string)
    reader_emails = list(string)
  }))
  description = "Map of resource manager folders to create under the root organization."
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
    sandboxes = {
      name          = "Sandboxes"
      owner_emails  = []
      reader_emails = []
    }
  }
}

##################
## CONNECTIVITY ##
##################

variable "connectivity" {
  type = object({
    dns_zones = optional(map(object({
      dns_name      = string
      name          = optional(string, null)
      contact_email = optional(string, null)
      type          = optional(string, "primary")
      acl           = optional(string, null)
      description   = optional(string, null)
      default_ttl   = optional(number, 3600)
    })), {})
    network_area = optional(object({
      ranges                = list(string)
      transfer_network      = string
      min_prefix_length     = optional(number, 24)
      max_prefix_length     = optional(number, 28)
      default_prefix_length = optional(number, 28)
    }), null)
    firewall = optional(object({
      zone                     = string
      flavor                   = string
      name                     = string
      volume_performance_class = optional(string, "storage_premium_perf4")
      volume_size              = optional(number, 16)
      lan_network_range        = string
      wan_network_range        = string
      lan_ip                   = optional(string, null)
      wan_ip                   = optional(string, null)
    }), null)
  })
  description = "Connectivity configuration including DNS zones, network area, and firewall. Set firewall/network_area to null to skip deployment."
  default     = null
}

###############
## SANDBOXES ##
###############

variable "sandboxes" {
  type = list(object({
    project_name        = string
    owner_emails        = optional(list(string))
    project_owner_email = string
  }))
  description = "List of sandboxes to create."
  default     = []
}

##################
## LANDING ZONE ##
##################

variable "landing_zones" {
  type = map(object({
    project_name = string
    project_code = string
    owner_email  = string
    # Set to true for corporate landing zones (connected to network area), false for public
    corporate = optional(bool, true)
    env       = optional(string, "dev")
    role_assignments = optional(list(object({
      role    = string
      subject = string
    })), [])
    network_prefix_length = optional(number, null)
    custom_roles = optional(list(object({
      name        = string
      description = string
      permissions = list(string)
    })), [])
  }))
  description = "Map of landing zones to create. Set corporate = true for network area connectivity, false for public."
  default     = {}
}
