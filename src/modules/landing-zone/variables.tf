variable "organization_id" {
  type        = string
  description = "Container ID of the root organization."
}

variable "custom_roles" {
  type = list(object({
    name        = string
    description = string
    permissions = list(string)
  }))
  description = "List of custom roles to create for the project."
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for all resources in this module, e.g. \"myco-pltfm-hub-prod\"."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if corporate is true."
  default     = null
}

variable "corporate" {
  type        = bool
  description = "Whether this landing zone uses corporate networking (network area + routing). Set to false for public internet."
  default     = false
}

variable "network_prefix_length" {
  type        = number
  description = "CIDR block prefix length for the project's network range."
  default     = null
}

variable "owner_email" {
  type        = string
  description = "Email address of the project owner. Required for project creation."
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
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

variable "firewall_next_hop_ip" {
  type        = string
  description = "IP address of the firewall next hop."
  default     = null
}

variable "ipv4_nameservers" {
  type        = list(string)
  description = "List of IPv4 nameservers for the network."
  default     = null
}

variable "dns_zone_name" {
  type        = string
  description = "Full DNS zone domain name for this landing zone. Set to null to skip DNS zone creation."
  default     = null
}

variable "secretsmanager_acls" {
  type        = list(string)
  description = "List of ACL rules for the Secrets Manager instance. Set to empty list for no ACLs or null to skip Secrets Manager creation."
  default     = []
}