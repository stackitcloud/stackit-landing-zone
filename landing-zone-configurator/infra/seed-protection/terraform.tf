terraform {
  required_version = "= 1.12.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.66.0"
    }
  }

  # Enables protection after bootstrap credentials exist; encrypted local operator state.
  backend "local" {}

  encryption {
    # The operator wrapper supplies the passphrase via TF_ENCRYPTION, never a tfvars file.
    key_provider "pbkdf2" "state" {}
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}
