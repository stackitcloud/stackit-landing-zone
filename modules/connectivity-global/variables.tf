variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
  default     = null
}

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
  description = "List of network areas to create, each with its own name, ranges, and configuration."
}

variable "network_area_routes" {
  type = list(object({
    name              = string
    network_area_name = string
    destination = object({
      type  = string
      value = string
    })
    next_hop = object({
      type  = string
      value = optional(string)
    })
  }))
  description = "List of static routes to create within network areas. Each route references a network area by name."
  default     = []
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}