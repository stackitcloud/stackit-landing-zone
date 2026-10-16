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
