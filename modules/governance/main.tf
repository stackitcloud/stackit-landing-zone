terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.85.0"
    }
  }
}

provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

locals {
  labels = length(var.labels) > 0 ? var.labels : null # provider bug: empty map becomes null after apply
}