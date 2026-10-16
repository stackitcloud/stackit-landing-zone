variable "region" {
  type        = string
  description = "STACKIT region of the bootstrap bucket."
}

variable "state_bucket_name" {
  type        = string
  description = "Existing state bucket from the bootstrap root."
}
