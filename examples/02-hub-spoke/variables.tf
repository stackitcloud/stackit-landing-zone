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

variable "devops_enabled" {
  type        = bool
  description = "Whether to deploy the DevOps module (Git repository project)."
  default     = true
}

variable "dns_zones" {
  type = map(object({
    dns_name      = string
    name          = optional(string, null)
    contact_email = optional(string, null)
    type          = optional(string, "primary")
    acl           = optional(string, null)
    description   = optional(string, null)
    default_ttl   = optional(number, 3600)
  }))
  description = "Map of DNS zone keys to DNS zone configuration. Name defaults to dns_name if not set."
  default     = {}
}

#############################
## CONNECTIVITY - REGIONAL ##
#############################

variable "network_area" {
  type = object({
    ranges                = list(string)
    transfer_network      = string
    min_prefix_length     = optional(number, 24)
    max_prefix_length     = optional(number, 28)
    default_prefix_length = optional(number, 28)
  })
  description = "Network area configuration including IP ranges, transfer network, and prefix length settings."
}

variable "firewall" {
  type = object({
    zone       = string
    flavor     = string
    lan_ip     = string
    lan_prefix = string
    wan_ip     = string
    wan_prefix = string
  })
  description = "pfSense firewall configuration. Set to null to skip firewall deployment."
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
