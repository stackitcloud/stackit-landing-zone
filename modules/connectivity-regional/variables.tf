variable "owner_email" {
  type        = string
  description = "Email address of the owner for the folders. Required for STACKIT resource manager."
}

variable "project_name" {
  type        = string
  description = "Name of the STACKIT project to create."
}

variable "project_code" {
  type        = string
  description = "Optional project code for the STACKIT project."
}

variable "company_name" {
  type        = string
  description = "Name of the company folder to create."
}

variable "company_code" {
  type        = string
  description = "Company code used in resource naming conventions."
}

variable "role_assignments" {
  type = list(object({
    role    = string
    subject = string
  }))
  description = "List of role assignments for the project. Subject can be a user email or service account email."
  default     = []
}

variable "region" {
  type        = string
  description = "STACKIT region for regional resources."
  default     = "eu01"
}

variable "env" {
  type        = string
  description = "Environment identifier (e.g., dev, staging, prod) used in resource naming conventions."
  default     = "dev"
}

variable "network_area_id" {
  type        = string
  description = "Network Area ID to deploy resources into. Required if network is enabled."
}

variable "organization_id" {
  type        = string
  description = "Organization ID, required for network area route configuration."
}

variable "labels" {
  type        = map(string)
  description = "Additional labels to apply to all folders."
  default     = {}
}

variable "parent_container_id" {
  type        = string
  description = "Parent container ID (folder or organization) where the project will be created."
}

variable "firewall_zone" {
  type        = string
  description = "STACKIT Availability Zone"
  default     = "eu01-m"
}

variable "firewall_flavor" {
  type        = string
  description = "Firewall VM Flavor"
  default     = "c1.2"
}

variable "vnet_range" {
  type        = string
  description = "CIDR range for the project VNet. Required if network is enabled."
  default     = "10.0.0.0/24"
}
variable "firewall_ip" {
  type        = string
  description = "IP address of the firewall"
  default     = "10.0.0.220"
}
