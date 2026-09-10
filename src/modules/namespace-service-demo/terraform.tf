terraform {
  required_version = ">= 1.11"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = ">= 0.114.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = ">= 4.45.2"
    }
  }
}
