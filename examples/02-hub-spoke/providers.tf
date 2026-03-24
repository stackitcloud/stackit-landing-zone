provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

provider "vault" {
  address          = "https://prod.sm.eu01.stackit.cloud"
  skip_child_token = true

  auth_login_userpass {
    username = module.management.secretsmanager_username
    password = module.management.secretsmanager_password
  }
}

provider "time" {}