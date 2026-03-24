provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}
