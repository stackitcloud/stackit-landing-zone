terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.83.0"
    }
  }
}

# provider "stackit" {
#   default_region        = var.region
#   enable_beta_resources = true
#   experiments           = ["iam", "routing-tables", "network"]
# }

locals {
  naming_pattern = "${var.company_code}-pltfm-${var.project_code}-${var.region}-${var.env}"
  project_labels = merge(
    var.network_area_id != null ? { "networkArea" = var.network_area_id } : {},
    var.labels
  )
}