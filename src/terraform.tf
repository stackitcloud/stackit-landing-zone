terraform {
  required_version = ">= 1.10"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.98.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.30.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.14.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.14.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.9.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.2.1"
    }
  }
}