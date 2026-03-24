variable "key_pairs" {
  type = map(object({
    public_key = string
  }))
  description = "Map of SSH key pairs to create. The map key is used as the key pair name."
  default     = {}
}

variable "network_id" {
  type        = string
  description = "STACKIT network ID for creating network interfaces. Required when servers use security_group_names instead of external network_interface_ids."
  default     = null
}

variable "project_id" {
  type        = string
  description = "STACKIT project ID to which the servers are associated."

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.project_id))
    error_message = "The project_id must be a valid UUID."
  }
}

variable "security_groups" {
  type = map(object({
    stateful = optional(bool, true)
    rules = optional(list(object({
      direction  = string
      ether_type = optional(string, "IPv4")
    })), [])
  }))
  description = "Map of security groups to create. The map key is used as the security group name. Rules are created automatically."
  default     = {}
}

variable "servers" {
  type = map(object({
    machine_type = string

    boot_volume = optional(object({
      source_type           = string
      source_id             = string
      size                  = optional(number)
      performance_class     = optional(string)
      delete_on_termination = optional(bool)
    }))

    availability_zone    = optional(string)
    keypair_name         = optional(string)
    user_data            = optional(string)
    labels               = optional(map(string))
    affinity_group       = optional(string)
    desired_status       = optional(string)
    image_id             = optional(string)
    region               = optional(string)
    security_group_names = optional(list(string), [])

    # Use network_interface_ids for externally managed NICs.
    # When null and network_id is set, a NIC is created automatically.
    network_interface_ids = optional(list(string))

    volumes = optional(map(object({
      size              = number
      availability_zone = optional(string)
      performance_class = optional(string)
      source = optional(object({
        type = string
        id   = string
      }))
    })), {})
  }))
  description = "Map of server configurations. The map key is used as the server name."

  validation {
    condition = alltrue([
      for name, server in var.servers :
      server.boot_volume == null || contains(["image", "volume"], server.boot_volume.source_type)
    ])
    error_message = "boot_volume.source_type must be either 'image' or 'volume'."
  }

  validation {
    condition = alltrue([
      for name, server in var.servers :
      server.boot_volume == null || server.boot_volume.source_type != "image" || server.boot_volume.size != null
    ])
    error_message = "boot_volume.size is required when boot_volume.source_type is 'image'."
  }

  validation {
    condition = alltrue([
      for name, server in var.servers :
      server.desired_status == null || contains(["active", "inactive", "deallocated"], server.desired_status)
    ])
    error_message = "desired_status must be one of: 'active', 'inactive', 'deallocated'."
  }
}
