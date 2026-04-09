variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}

variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "name" {
  type        = string
  description = "List of landing zone administrators with elevated permissions."
}

variable "members" { # TODO: type & desc
  type = any
  description = "List of role assignments for the project. Subject can be a user email or service account email."
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}