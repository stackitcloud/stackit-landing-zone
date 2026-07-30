terraform {
  required_version = ">= 1.11"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.104.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "3.2.1"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.2.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.14.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.10.1"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "4.42.0"
    }
    opnsense = {
      source  = "browningluke/opnsense"
      version = "0.24.0"
    }
  }
}