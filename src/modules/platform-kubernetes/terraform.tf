terraform {
  required_version = ">= 1.10, < 2.0"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.104.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14.0"
    }
  }
}
