terraform {
  required_version = "= 1.12.6"
  required_providers {
    cloudfoundry = {
      source  = "cloudfoundry/cloudfoundry"
      version = "1.17.0"
    }
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.114.0"
    }
  }
  backend "s3" {}

  encryption {
    # CI supplies the passphrase via TF_ENCRYPTION, never a tfvars file.
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
