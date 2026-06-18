terraform {
  required_version = ">= 1.10, < 2.0"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "~> 0.99.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 5.9.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.0"
    }
  }
}