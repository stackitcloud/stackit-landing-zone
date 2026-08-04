########################
## FIREWALL BOOTSTRAP ##
########################

locals {
  firewall_endpoint = try(
    coalesce(
      try(var.firewall_config.endpoint, null),
      "https://${coalesce(
        var.connectivity.firewall.lan_ip,
        cidrhost(var.connectivity.firewall.lan_network_range, 4)
      )}"
    ),
    "https://127.0.0.1"
  )
  firewall_bootstrapped_credentials = try(jsondecode(file("${path.root}/.firewall-api-credentials.json")), null)

  firewall_secretsmanager_credentials = try({
    api_key    = ephemeral.vault_kv_secret_v2.firewall_api[0].data.api_key
    api_secret = ephemeral.vault_kv_secret_v2.firewall_api[0].data.api_secret
  }, null)

  firewall_api_credentials = coalesce(
    var.firewall_api_credentials,
    local.firewall_bootstrapped_credentials,
    local.firewall_secretsmanager_credentials,
    { api_key = "unset", api_secret = "unset" },
  )

  firewall_config_enabled = var.firewall_config != null && (
    var.firewall_api_credentials != null ||
    !var.firewall_bootstrap ||
    local.firewall_bootstrapped_credentials != null
  )
}

############################################
## FIREWALL API KEY SECRET  - FIRST APPLY ##
############################################

resource "terraform_data" "firewall_api_bootstrap" {
  count = (
    try(var.connectivity.firewall, null) != null &&
    var.firewall_bootstrap &&
    var.firewall_api_credentials == null &&
    local.firewall_bootstrapped_credentials == null
  ) ? 1 : 0

  triggers_replace = [
    local.firewall_endpoint,
    try(module.connectivity[0].firewall_public_ip, ""),
  ]

  provisioner "local-exec" {
    command     = "'${path.module}/modules/firewall-config/scripts/bootstrap-api-key.sh' '${local.firewall_endpoint}' '${var.firewall_admin_username}'"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_PASSWORD = var.firewall_admin_password
      OUTPUT_FILE       = "${path.root}/.firewall-api-credentials.json"
    }
  }
}

resource "vault_kv_secret_v2" "firewall_api_credentials" {
  count = (
    try(var.connectivity.firewall, null) != null && (
      local.firewall_bootstrapped_credentials != null ||
      (var.firewall_config != null && !var.firewall_bootstrap)
    )
  ) ? 1 : 0

  mount               = module.management.secretsmanager_instance_id
  name                = "firewall_api_${replace(var.company_code, "-", "_")}_pltfm_hub_prod"
  delete_all_versions = true
  data_json_wo = jsonencode(
    local.firewall_bootstrapped_credentials != null
    ? local.firewall_bootstrapped_credentials
    : local.firewall_secretsmanager_credentials
  )
  data_json_wo_version = var.firewall_api_secret_version
}

#############################################
## FIREWALL API KEY SECRET  - SECOND APPLY ##
#############################################

ephemeral "vault_kv_secret_v2" "firewall_api" {
  count = (
    try(var.connectivity.firewall, null) != null &&
    var.firewall_config != null &&
    !var.firewall_bootstrap
  ) ? 1 : 0

  mount = module.management.secretsmanager_instance_id
  name  = "firewall_api_${replace(var.company_code, "-", "_")}_pltfm_hub_prod"
}

#################################
## FIREWALL  HIGH AVAILABILITY ##
#################################

# CARP and pfsync between the two appliances have to pass ahead of every block rule, and
# the alias content is the pair's LAN addresses, which only the connectivity module knows.
# Neither can come from the .tfvars, so both are injected here whenever HA is on. This is
# not a convenience: block-lz-to-lz (any protocol, network_area to network_area) silently
# kills the CARP election and the state sync, and a split cluster black-holes traffic.
#
# Injected last, so these three keys win over an entry of the same name in the .tfvars.
locals {
    firewall_ha_enabled = try(var.connectivity.firewall.ha, null) != null

    firewall_ha_aliases = local.firewall_ha_enabled ? {
      fw_cluster = {
        type        = "host"
        enabled     = true
        description = "LAN addresses of the firewall HA pair"
        content     = try(module.connectivity[0].firewall_cluster_lan_ips, [])
        update_freq = null
        stats       = false
      }
    } : {}

    firewall_ha_rule_defaults = {
      sequence           = 100
      enabled            = true
      action             = "pass"
      direction          = "in"
      interfaces         = ["lan"]
      protocol           = "any"
      ip_protocol        = "inet"
      quick              = true
      source_net         = "fw_cluster"
      source_port        = null
      source_invert      = false
      destination_net    = "fw_cluster"
      destination_port   = null
      destination_invert = false
      log                = false
      description        = null
    }

    # 90/91 puts them ahead of every landing zone rule, which start at 100 — block-lz-to-lz
    # in particular. They sit behind the two floating GUI rules at 10/20, which match TCP on
    # port 443 only and can therefore never swallow CARP or pfsync.
    firewall_ha_rules = local.firewall_ha_enabled ? {
      allow-fw-carp = merge(local.firewall_ha_rule_defaults, {
        sequence    = 90
        protocol    = "CARP"
        description = "Unicast CARP advertisements between the HA pair"
      })

      allow-fw-pfsync = merge(local.firewall_ha_rule_defaults, {
        sequence    = 91
        protocol    = "PFSYNC"
        description = "pfsync state replication between the HA pair"
      })
    } : {}
}