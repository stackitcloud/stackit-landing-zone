variable "clusters" {
  type = map(object({
    kubernetes_version_min = optional(string)
    region                 = optional(string)

    node_pools = list(object({
      name                    = string
      machine_type            = optional(string, "c1.2")
      minimum                 = optional(number, 1)
      maximum                 = optional(number, 2)
      availability_zones      = optional(list(string), ["eu01-m"]) # max two eu01-1, eu01-2, eu01-3, eu01-m
      allow_system_components = optional(bool, false)
      cri                     = optional(string, "containerd")
      labels                  = optional(map(string))
      max_surge               = optional(number, 2)
      max_unavailable         = optional(number)
      os_name                 = optional(string, "flatcar") # or "ubuntu"
      os_version_min          = optional(string)
      volume_size             = optional(number, 20)
      volume_type             = optional(string, "storage_premium_perf1")
      taints = optional(list(object({
        effect = string
        key    = string
        value  = optional(string)
      })))
    }))

    maintenance = optional(object({
      enable_kubernetes_version_updates    = optional(bool, true)
      enable_machine_image_version_updates = optional(bool, true)
      start                                = string
      end                                  = string
      }), {
      enable_kubernetes_version_updates    = true
      enable_machine_image_version_updates = true
      start                                = "01:00:00Z"
      end                                  = "02:00:00Z"
    })

    network_id            = optional(string)
    public_access_enabled = optional(bool, true)

    extensions = optional(object({
      acl = optional(object({
        enabled       = bool
        allowed_cidrs = list(string)
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

    hibernations = optional(list(object({
      start    = string
      end      = string
      timezone = optional(string)
    })))
  }))
  description = "Map of SKE cluster configurations. The map key is used as the cluster name."

  validation {
    condition = alltrue([
      for name, _ in var.clusters :
      can(regex("^[a-z][a-z0-9-]*$", name))
    ])
    error_message = "Cluster names must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens."
  }

  validation {
    condition = alltrue(flatten([
      for cluster in var.clusters : [
        for np in cluster.node_pools :
        np.minimum >= 1
      ]
    ]))
    error_message = "Node pool minimum must be at least 1."
  }

  validation {
    condition = alltrue(flatten([
      for cluster in var.clusters : [
        for np in cluster.node_pools :
        np.minimum <= np.maximum
      ]
    ]))
    error_message = "Node pool minimum must be less than or equal to maximum."
  }
}

variable "project_id" {
  type        = string
  description = "STACKIT project ID to which the clusters are associated."

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.project_id))
    error_message = "The project_id must be a valid UUID."
  }
}
