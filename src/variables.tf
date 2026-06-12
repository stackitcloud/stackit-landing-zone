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

variable "platform_kubernetes" {
  type = map(object({
    region = string
    network = optional(object({
      mode                      = optional(string, "public")
      sna_network_area_id       = optional(string, null)
      sna_network_prefix_length = optional(number, 24)
    }), {})
    dns = optional(object({
      enabled      = optional(bool, true)
      create_zones = optional(bool, true)
      zones        = optional(list(string), [])
    }), {})
    observability = optional(object({
      enabled   = optional(bool, true)
      plan_name = optional(string, "Observability-Starter-EU01")
      acl       = optional(list(string), [])
      name      = optional(string, null)
    }), {})
    encrypted_volumes = optional(object({
      enabled            = optional(bool, false)
      storage_class_name = optional(string, "stackit-encrypted-premium")
      kms_keyring_name   = optional(string, "ske-volume-keyring")
      kms_key_name       = optional(string, "ske-volume-key")
      kms_key_version    = optional(string, "1")
    }), {})
    debug_bastion = optional(object({
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
    }), {})
    role_assignments = optional(list(object({
      role    = string
      subject = string
    })), [])
    cluster = object({
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
  }))
  description = "Map of central, region-scoped platform Kubernetes deployments. Empty map skips deployment."
  default     = {}
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

variable "federated_identity_providers" {
  type = list(object({
    name   = string
    issuer = string
    assertions = list(object({
      item     = string
      operator = string
      value    = string
    }))
  }))
  description = "List of federated identity providers to configure for the management service account."
  default     = []
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
    observability = optional(object({
      enabled   = optional(bool, false)
      plan_name = optional(string, "Observability-Starter-EU01")
      acl       = optional(list(string), [])
      name      = optional(string, null)
    }), {})
    namespace_service = optional(object({
      enabled        = optional(bool, false)
      namespace      = optional(string, null)
      dns_subdomain  = optional(string, null)
      secretsmanager = optional(bool, true)
      demo = optional(object({
        enabled                    = optional(bool, false)
        image                      = optional(string, "hashicorp/http-echo:1.0.0")
        ingress_class_name         = optional(string, "lz-demo")
        install_ingress_controller = optional(bool, true)
        external_secret_enabled    = optional(bool, true)
        dashboard_example_enabled  = optional(bool, true)
      }), {})
      sample_load = optional(object({
        enabled = optional(bool, false)
        image   = optional(string, "busybox:1.36")
      }), {})
      secrets_enforcement = optional(object({
        enabled                   = optional(bool, false)
        mode                      = optional(string, "audit")
        allow_opaque_secret_types = optional(list(string), [])
        break_glass = optional(object({
          enabled    = optional(bool, true)
          ttl_hours  = optional(number, 24)
          principals = optional(list(string), [])
        }), {})
      }), {})
      kubernetes_access = optional(object({
        enabled              = optional(bool, true)
        service_account_name = optional(string, null)
      }), {})
      labels      = optional(map(string), {})
      annotations = optional(map(string), {})
    }), {})
  }))
  description = "Map of landing zones to create. Set corporate = true for network area connectivity, false for public."
  default     = {}

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      lz.namespace_service.namespace == null ? true : (
        length(lz.namespace_service.namespace) <= 63 &&
        can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", lz.namespace_service.namespace))
      )
    ])
    error_message = "If namespace_service.namespace is set, it must be a valid Kubernetes DNS-1123 label (<=63 chars, lowercase alphanumeric and '-', must start/end with alphanumeric)."
  }

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      lz.namespace_service.dns_subdomain == null ? true : (
        length(lz.namespace_service.dns_subdomain) <= 63 &&
        can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", lz.namespace_service.dns_subdomain))
      )
    ])
    error_message = "If namespace_service.dns_subdomain is set, it must be a valid DNS label (<=63 chars, lowercase alphanumeric and '-', must start/end with alphanumeric)."
  }

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      lz.namespace_service.dns_subdomain == null || lz.namespace_service.enabled
    ])
    error_message = "namespace_service.dns_subdomain can only be set when namespace_service.enabled is true."
  }

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      lz.namespace_service.kubernetes_access.service_account_name == null ? true : (
        length(lz.namespace_service.kubernetes_access.service_account_name) <= 63 &&
        can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", lz.namespace_service.kubernetes_access.service_account_name))
      )
    ])
    error_message = "If namespace_service.kubernetes_access.service_account_name is set, it must be a valid Kubernetes DNS-1123 label (<=63 chars, lowercase alphanumeric and '-', must start/end with alphanumeric)."
  }

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      contains(["audit", "soft", "strict"], lower(lz.namespace_service.secrets_enforcement.mode))
    ])
    error_message = "namespace_service.secrets_enforcement.mode must be one of: audit, soft, strict."
  }

  validation {
    condition = alltrue([
      for lz in values(var.landing_zones) :
      lz.namespace_service.secrets_enforcement.break_glass.ttl_hours > 0
    ])
    error_message = "namespace_service.secrets_enforcement.break_glass.ttl_hours must be greater than 0."
  }
}
