terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = ">=0.98.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">=0.12.0"
    }
  }
}
