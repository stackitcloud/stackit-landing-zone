terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.88.0"
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