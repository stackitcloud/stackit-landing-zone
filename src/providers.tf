provider "stackit" {
  default_region        = var.region
  enable_beta_resources = true
  experiments           = ["iam", "routing-tables", "network"]
}

# Provider aliases are static because OpenTofu cannot select them dynamically.
# Add a matching provider block and module instance when supporting another region.
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

locals {
  platform_kubernetes_cluster_key = try(one(keys(module.platform_kubernetes)), null)

  platform_kubernetes_kube_config = var.platform_kubernetes_kube_config_override != null ? var.platform_kubernetes_kube_config_override : (
    local.platform_kubernetes_cluster_key != null ? module.platform_kubernetes[local.platform_kubernetes_cluster_key].kube_config : null
  )
}

provider "kubernetes" {
  alias = "platform"

  host = try(
    yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster.server,
    null
  )
  client_certificate = try(
    base64decode(yamldecode(local.platform_kubernetes_kube_config).users[0].user["client-certificate-data"]),
    null
  )
  client_key = try(
    base64decode(yamldecode(local.platform_kubernetes_kube_config).users[0].user["client-key-data"]),
    null
  )
  cluster_ca_certificate = try(
    base64decode(yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster["certificate-authority-data"]),
    null
  )
}

provider "helm" {
  alias = "platform"

  kubernetes = {
    host = try(
      yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster.server,
      null
    )
    client_certificate = try(
      base64decode(yamldecode(local.platform_kubernetes_kube_config).users[0].user["client-certificate-data"]),
      null
    )
    client_key = try(
      base64decode(yamldecode(local.platform_kubernetes_kube_config).users[0].user["client-key-data"]),
      null
    )
    cluster_ca_certificate = try(
      base64decode(yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster["certificate-authority-data"]),
      null
    )
  }
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

provider "opnsense" {
  uri            = local.firewall_endpoint
  api_key        = local.firewall_api_credentials.api_key
  api_secret     = local.firewall_api_credentials.api_secret
  allow_insecure = try(var.firewall_config.insecure, true)
}