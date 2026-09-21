terraform {
  required_version = ">= 1.11"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = ">= 0.114.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.14.1"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.9.0"
    }
  }
}
