provider "stackit" {
  default_region        = try(local.target.region, "eu01")
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}