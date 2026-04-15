variable "organization_id" {
  type        = string
  description = "Container ID of the root folder or organization under which the company folder will be created."
}

variable "members" { # TODO: type & desc
  type = any
  description = "List of role assignments for the project. Subject can be a user email or service account email."
}

variable "network_areas" { # TODO: type & desc
  type = any
  description = "List of role assignments for the project. Subject can be a user email or service account email."
}