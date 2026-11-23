provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

provider "stackit" {
  alias                 = "eu01"
  default_region        = "eu01"
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

provider "stackit" {
  alias                 = "eu02"
  default_region        = "eu02"
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}
