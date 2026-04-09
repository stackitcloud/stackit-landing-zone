variable "landing-zones" {
  type        = any
  description = "List of landing zone administrators with elevated permissions."
  default     = []
}

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
variable "members" { # TODO: type & desc
  type = any
  description = "List of role assignments for the project. Subject can be a user email or service account email."
}