terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.100.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.14.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.10.1"
    }
  }
}