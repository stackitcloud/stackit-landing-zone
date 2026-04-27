variable "firewall_enabled" {
  type        = bool
  description = "Whether to deploy the pfSense firewall and associated WAN/LAN networks. Set to false for connectivity without a firewall."
  default     = true
}

variable "firewall_flavor" {
  type        = string
  description = "Firewall VM Flavor"
  default     = "c1.2"

  validation {
    condition     = can(regex("^[a-z][0-9]+\\.[0-9]+$", var.firewall_flavor))
    error_message = "firewall_flavor must match STACKIT machine type format (e.g. c1.2). Validate available flavors with: stackit server machine-type list"
  }
}

variable "firewall_ip" {
  type        = string
  description = "IP address of the firewall"
  default     = "10.0.0.220"
}

variable "firewall_zone" {
  type        = string
  description = "STACKIT Availability Zone"
  default     = "eu01-m"
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "network_area_name" {
  type        = string
  description = "Name of the network area to create for this region."
}

variable "network_ranges" {
  type        = list(object({ prefix = string }))
  description = "IP ranges that will be sliced into per-project subnets."
}

variable "transfer_network_range" {
  type        = string
  description = "Transfer network CIDR used for routing between projects in this area."
}

variable "max_prefix_length" {
  type        = number
  description = "Maximum prefix length for subnets assigned to projects."
  default     = 28
}

variable "min_prefix_length" {
  type        = number
  description = "Minimum prefix length for subnets assigned to projects."
  default     = 24
}

variable "default_prefix_length" {
  type        = number
  description = "Default prefix length for subnets assigned to projects."
  default     = 28
}

variable "default_nameservers" {
  type        = list(string)
  description = "Default nameservers for the network area."
  default     = ["1.0.0.1", "1.1.1.1"]
}

variable "organization_id" {
  type        = string
  description = "Organization ID, required for network area and route configuration."
}

variable "project_id" {
  type        = string
  description = "Project ID of the connectivity project (created by connectivity-global)."
}

variable "vnet_range" {
  type        = string
  description = "CIDR range for the project VNet. Required if network is enabled."
  default     = "10.0.0.0/24"
}
