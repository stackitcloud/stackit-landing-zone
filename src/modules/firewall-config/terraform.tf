terraform {
  required_version = ">= 1.11"

  required_providers {
    opnsense = {
      source  = "browningluke/opnsense"
      version = ">= 0.26.0"
    }
  }
}
