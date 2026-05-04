terraform {
  required_version = ">= 1.5"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = ">=0.93.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">=0.13.1"
    }
  }
}