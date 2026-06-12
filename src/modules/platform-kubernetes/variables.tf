variable "cluster" {
  type = object({
    name                   = string
    kubernetes_version_min = optional(string, null)
    node_pools = optional(list(object({
      name               = string
      machine_type       = string
      minimum            = number
      maximum            = number
      availability_zones = list(string)
      volume_size        = optional(number, 20)
      volume_type        = optional(string, "storage_premium_perf1")
      os_name            = optional(string, "flatcar")
      labels             = optional(map(string), {})
    })), [])
    maintenance = optional(object({
      enable_kubernetes_version_updates    = optional(bool, true)
      enable_machine_image_version_updates = optional(bool, true)
      start                                = optional(string, "01:00:00Z")
      end                                  = optional(string, "02:00:00Z")
    }), {})
  })
  description = "SKE cluster configuration."
}

variable "dns" {
  type = object({
    enabled      = optional(bool, true)
    create_zones = optional(bool, true)
    zones        = optional(list(string), [])
  })
  description = "SKE DNS extension configuration. If create_zones is true, zones are created in the platform project before cluster creation."
  default     = {}
}

variable "encrypted_volumes" {
  type = object({
    enabled            = optional(bool, false)
    storage_class_name = optional(string, "stackit-encrypted-premium")
    kms_keyring_name   = optional(string, "ske-volume-keyring")
    kms_key_name       = optional(string, "ske-volume-key")
    kms_key_version    = optional(string, "1")
  })
  description = "Optional encrypted volume setup for SKE via KMS and Kubernetes storage class."
  default     = {}
}

variable "debug_bastion" {
  type = object({
    enabled             = optional(bool, false)
    name                = optional(string, null)
    availability_zone   = optional(string, null)
    machine_type        = optional(string, "g2i.1")
    image_id            = optional(string, "7b10e105-295b-4369-b6e0-567ec940a02b")
    boot_volume_size    = optional(number, 20)
    ssh_public_key      = optional(string, null)
    ssh_public_key_path = optional(string, "~/.ssh/id_rsa.pub")
    ssh_allowed_cidrs   = optional(list(string), ["0.0.0.0/0"])
    assign_public_ip    = optional(bool, true)
    install_kubectl     = optional(bool, true)
  })
  description = "Optional debug bastion VM in the SNA network with SSH access to test SKE connectivity from inside the private network."
  default     = {}
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to resources in this module."
  default     = {}
}

variable "naming_pattern" {
  type        = string
  description = "Naming prefix for resources in this module, e.g. myco-pltfm-k8s-eu01."
}

variable "network" {
  type = object({
    mode                      = optional(string, "public")
    sna_network_area_id       = optional(string, null)
    sna_network_prefix_length = optional(number, 24)
  })
  description = "Network mode for SKE. mode=public configures public control plane, mode=sna configures SNA and requires sna_network_area_id at apply time."
  default     = {}
}

variable "observability" {
  type = object({
    enabled   = optional(bool, true)
    plan_name = optional(string, "Observability-Starter-EU01")
    acl       = optional(list(string), [])
    name      = optional(string, null)
  })
  description = "Observability configuration for central cluster monitoring in the same project as the cluster."
  default     = {}
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

variable "region" {
  type        = string
  description = "STACKIT region for the SKE cluster."
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}
