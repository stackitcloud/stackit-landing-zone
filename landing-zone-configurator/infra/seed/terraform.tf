terraform {
  required_version = "= 1.12.6"
  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.114.0"
    }
  }

  # This root creates its own future backend; the initial state is encrypted locally.
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
