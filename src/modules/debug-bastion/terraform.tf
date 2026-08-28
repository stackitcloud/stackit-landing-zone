terraform {
  required_version = ">= 1.11"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.106.0"
    }
  }
}
