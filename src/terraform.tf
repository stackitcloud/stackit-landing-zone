terraform {
  required_version = ">= 1.11"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.116.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "3.2.1"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.14.2"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.12.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "4.46.0"
    }
    opnsense = {
      source  = "browningluke/opnsense"
      version = "0.26.0"
    }
  }
}
