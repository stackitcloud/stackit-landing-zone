terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.101.0"
    }
  }
}