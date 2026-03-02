###############
## VARIABLES ##
###############

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

variable "platform_admins" {
  type        = list(string)
  description = "List of platform administrators."
  default     = []
}

variable "landing_zone_admins" {
  type        = list(string)
  description = "List of landing zone administrators."
  default     = []
}

##############################
## CONNECTIVITY - GLOBAL    ##
##############################

variable "network_areas" {
  type = list(object({
    name                   = string
    network_ranges         = list(object({ prefix = string }))
    transfer_network_range = string
    max_prefix_length      = optional(number, 28)
    min_prefix_length      = optional(number, 24)
    default_prefix_length  = optional(number, 28)
    default_nameservers    = optional(list(string), null)
  }))
  description = "List of network areas to create with their IP ranges and configuration."
}

################################
## CONNECTIVITY - REGIONAL    ##
################################

variable "connectivity_regional_network_area" {
  type        = string
  description = "Name key of the network area (from network_areas) to use for the regional connectivity project."
}

variable "firewall_zone" {
  type        = string
  description = "STACKIT Availability Zone for the firewall VM."
  default     = "eu01-m"
}

variable "firewall_flavor" {
  type        = string
  description = "Firewall VM flavor."
  default     = "c1.2"
}

variable "connectivity_vnet_range" {
  type        = string
  description = "CIDR range for the connectivity project VNet."
  default     = "10.0.0.0/24"
}

variable "firewall_ip" {
  type        = string
  description = "Static IP address for the firewall LAN interface."
  default     = "10.0.0.220"
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
    kubernetes_clusters = optional(map(object({
      kubernetes_version                   = string
      enable_kubernetes_version_updates    = optional(bool, true)
      enable_machine_image_version_updates = optional(bool, true)
      hibernations = optional(list(object({
        start    = string
        end      = string
        timezone = optional(string, "Europe/Berlin")
      })), [])
      node_pools = list(object({
        name               = string
        machine_type       = string
        availability_zones = list(string)
        os_version_min     = optional(string)
        minimum            = number
        maximum            = number
        max_surge          = optional(number)
        max_unavailable    = optional(number)
        labels             = optional(map(string))
        taints = optional(list(object({
          key    = string
          value  = string
          effect = string
        })))
      }))
      extensions = optional(object({
        acl = optional(object({
          allowed_cidrs = list(string)
          enabled       = bool
        }))
        dns = optional(object({
          enabled = bool
          zones   = optional(list(string))
        }))
        observability = optional(object({
          enabled     = bool
          instance_id = optional(string)
        }))
      }))
    })), {})
  }))
  description = "Map of landing zones to create. Set corporate = true for network area connectivity, false for public."
  default     = {}
}
