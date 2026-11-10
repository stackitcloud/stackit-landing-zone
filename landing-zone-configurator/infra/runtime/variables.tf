variable "project_id" {
  type = string
}
variable "region" {
  type = string
}
variable "cf_org_id" {
  type = string
}
variable "cf_username" {
  type = string
}
variable "database_instance_id" {
  type = string
}
variable "secrets_instance_id" {
  type = string
}
variable "model_serving_token" {
  type      = string
  sensitive = true
}
variable "credential_generation" {
  type    = string
  default = "initial"
}

variable "production" {
  type        = bool
  description = "Create isolated production deployment identities and the public endpoint."
  default     = false
}

variable "public_domain" {
  type        = string
  description = "Exact public application hostname; no wildcard certificate."
  default     = null
}

variable "dns_zone" {
  type        = string
  description = "Dedicated DNS zone for the application endpoint."
  default     = null
}

variable "dns_contact_email" {
  type        = string
  description = "Central operator contact for the DNS zone."
  default     = null
}
