terraform {
  required_version = ">= 1.10"

  required_providers {
    opnsense = {
      source  = "browningluke/opnsense"
      version = "0.24.0"
    }
  }
}
