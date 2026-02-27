terraform {
  required_version = ">= 1.5"
  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.83.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.13.1"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.7.0"
    }
  }
}

provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

provider "time" {}

provider "vault" {
  address          = "https://prod.sm.eu01.stackit.cloud"
  skip_child_token = true

  auth_login_userpass {
    username = stackit_secretsmanager_user.default.username
    password = stackit_secretsmanager_user.default.password
  }
}

locals {
  lz_type        = var.network_area_id == null ? "public" : "corp"
  naming_pattern = "${var.company_code}-${local.lz_type}-${var.project_code}-${var.env}"
}