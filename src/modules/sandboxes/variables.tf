variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "naming_prefix" {
  type        = string
  description = "Naming prefix for all resources in this module."
}

variable "sandboxes" {
  type = list(object({
    project_name        = string
    owner_emails        = optional(list(string))
    project_owner_email = string
  }))

  description = "List of sandboxes to create."
  default     = []
}