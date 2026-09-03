terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.113.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.0"
    }
  }
}
