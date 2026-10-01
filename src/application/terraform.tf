terraform {
  required_version = ">= 1.11"
  backend "s3" {}
  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.114.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.14.1"
    }
  }
}
provider "stackit" {
  default_region        = try(local.target.region, "eu01")
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}
