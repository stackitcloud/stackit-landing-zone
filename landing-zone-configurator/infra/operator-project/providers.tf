provider "stackit" {
  experiments           = ["iam"]
  default_region        = var.region
  service_account_email = var.operator_service_account_email
}
