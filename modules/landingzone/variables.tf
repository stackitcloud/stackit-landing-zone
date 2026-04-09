variable "landing-zones" {
  type        = any
  description = "List of landing zone administrators with elevated permissions."
  default     = []
}

# variable "project_name" {
#   type        = string
#   description = "Name of the STACKIT project to create."
# }

# variable "project_code" {
#   type        = string
#   description = "Optional project code for the STACKIT project."
# }

# variable "company_code" {
#   type        = string
#   description = "Company code used in resource naming conventions."
# }

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "name" {
  type        = string
  description = "Email address of the project owner. Required for project creation."
}

variable "owner_email" {
  type        = string
  description = "Email address of the project owner. Required for project creation."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all resources."
  default     = {}
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}
variable "members" {
  type = any
  description = "List of role assignments for the project. Subject can be a user email or service account email."
}
# variable "network_area_id" {
#   type        = string
#   description = "Network Area ID to deploy resources into. Required if network is enabled."
#   default     = null
# }

# variable "env" {
#   type        = string
#   description = "Environment identifier (e.g., dev, staging, prod) used in resource naming conventions."
#   default     = "dev"
# }

# variable "role_assignments" {
#   type = list(object({
#     role    = string
#     subject = string
#   }))
#   description = "List of role assignments for the project. Subject can be a user email or service account email."
#   default     = []
# }

# variable "network_prefix_length" {
#   type        = number
#   description = "CIDR block prefix length for the project's network range."
#   default     = null
# }

#variable "custom_roles" {
#  type = list(object({
#    name        = string
#    description = string
#    permissions = list(string)
#  }))
#  description = "List of custom roles to create for the project."
#}