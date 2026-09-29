variable "region" {
  type        = string
  description = "STACKIT region of the bootstrap bucket."
}

variable "state_bucket_name" {
  type        = string
  description = "Existing state bucket from the bootstrap root."
}

variable "storage_access_key" {
  type      = string
  sensitive = true
}
variable "storage_secret_key" {
  type      = string
  sensitive = true
}
