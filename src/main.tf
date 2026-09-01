################
## GOVERNANCE ##
################

module "governance" {
  source = "./modules/governance"

  owner_email           = var.owner_email
  organization_id       = var.organization_id
  rm_folder_parent_id   = var.rm_folder_parent_id
  labels                = var.labels
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors

  rm_folders = var.rm_folders
}

################
## MANAGEMENT ##
################

module "management" {
  source = "./modules/management"

  owner_email                  = var.owner_email
  naming_pattern               = "${var.company_code}-pltfm-mgmt-prod"
  parent_container_id          = module.governance.folder_container_ids["platform"]
  organization_id              = var.organization_id
  labels                       = var.labels
  observability                = var.observability
  audit_logs                   = var.audit_logs
  federated_identity_providers = var.federated_identity_providers
}

##################
## CONNECTIVITY ##
##################

module "connectivity" {
  source = "./modules/connectivity"
  count  = var.connectivity != null && var.connectivity_regions == null ? 1 : 0

  owner_email         = var.owner_email
  naming_pattern      = coalesce(var.connectivity.naming_pattern, "${var.company_code}-pltfm-connectivity")
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
  region              = var.region
  dns_zones           = var.connectivity.dns_zones
  network_areas = var.connectivity.network_areas != null ? {
    for key, area in var.connectivity.network_areas : key => {
      name                  = area.name
      ranges                = area.ranges
      transfer_network      = area.transfer_network
      min_prefix_length     = area.min_prefix_length
      max_prefix_length     = area.max_prefix_length
      default_prefix_length = area.default_prefix_length
      default_nameservers   = area.default_nameservers
    }
    } : var.connectivity.network_area != null ? {
    default = {
      name                  = null
      ranges                = var.connectivity.network_area.ranges
      transfer_network      = var.connectivity.network_area.transfer_network
      min_prefix_length     = var.connectivity.network_area.min_prefix_length
      max_prefix_length     = var.connectivity.network_area.max_prefix_length
      default_prefix_length = var.connectivity.network_area.default_prefix_length
      default_nameservers   = var.connectivity.network_area.default_nameservers
  } } : {}
  firewall            = var.connectivity.firewall
  firewalls           = var.connectivity.firewalls
  vpn                 = var.connectivity.vpn
  vpn_pre_shared_keys = var.vpn_pre_shared_keys

  # Only read when connectivity.firewall.ha is set, to log into both appliances and push
  # their node-local CARP settings. Unset endpoint means the primary's public IP.
  firewall_admin_endpoint = try(var.firewall_config.endpoint, null)
  firewall_admin_username = var.firewall_admin_username
  firewall_admin_password = var.firewall_admin_password
}

module "connectivity_eu01" {
  source    = "./modules/connectivity"
  count     = try(var.connectivity_regions["eu01"], null) != null ? 1 : 0
  providers = { stackit = stackit.eu01 }

  owner_email         = var.owner_email
  naming_pattern      = coalesce(try(var.connectivity_regions["eu01"].naming_pattern, null), "${var.company_code}-pltfm-connectivity-eu01")
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
  region              = "eu01"
  dns_zones           = try(var.connectivity_regions["eu01"].dns_zones, {})
  network_areas       = try(var.connectivity_regions["eu01"].network_areas, {})
  firewalls           = try(var.connectivity_regions["eu01"].firewalls, null)
  vpn                 = try(var.connectivity_regions["eu01"].vpn, null)
  vpn_pre_shared_keys = var.vpn_pre_shared_keys
}

module "connectivity_eu02" {
  source    = "./modules/connectivity"
  count     = try(var.connectivity_regions["eu02"], null) != null ? 1 : 0
  providers = { stackit = stackit.eu02 }

  owner_email         = var.owner_email
  naming_pattern      = coalesce(try(var.connectivity_regions["eu02"].naming_pattern, null), "${var.company_code}-pltfm-connectivity-eu02")
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
  region              = "eu02"
  dns_zones           = try(var.connectivity_regions["eu02"].dns_zones, {})
  network_areas       = try(var.connectivity_regions["eu02"].network_areas, {})
  firewalls           = try(var.connectivity_regions["eu02"].firewalls, null)
  vpn                 = try(var.connectivity_regions["eu02"].vpn, null)
  vpn_pre_shared_keys = var.vpn_pre_shared_keys
}

#####################
## FIREWALL POLICY ##
#####################

module "firewall_config" {
  source = "./modules/firewall-config"
  count  = local.firewall_config_enabled ? 1 : 0

  aliases       = merge(var.firewall_config.aliases, local.firewall_ha_aliases)
  routes        = var.firewall_config.routes
  rules         = merge(var.firewall_config.rules, local.firewall_ha_rules)
  outbound_nat  = var.firewall_config.outbound_nat
  port_forwards = var.firewall_config.port_forwards

  # OPNsense never replicates API-written config on its own, so the policy is pushed to
  # the peer explicitly after every change.
  endpoint       = local.firewall_endpoint
  ha_sync        = local.firewall_ha_enabled
  admin_username = var.firewall_admin_username
  admin_password = var.firewall_admin_password

  depends_on = [terraform_data.firewall_api_bootstrap, module.connectivity]
}

############
## DEVOPS ##
############

module "devops" {
  source = "./modules/devops"
  count  = var.devops != null ? 1 : 0

  owner_email            = var.owner_email
  naming_pattern         = "${var.company_code}-pltfm-devops-prod"
  company_name           = var.company_name
  parent_container_id    = module.governance.folder_container_ids["platform"]
  labels                 = var.labels
  git_flavor             = var.devops.git_flavor
  allowed_network_ranges = var.devops.allowed_network_ranges
}

#########################
## PLATFORM KUBERNETES ##
#########################

module "platform_kubernetes" {
  source   = "./modules/platform-kubernetes"
  for_each = var.connectivity_regions == null ? var.platform_kubernetes : {}

  owner_email         = var.owner_email
  organization_id     = var.organization_id
  naming_pattern      = "${var.company_code}-pltfm-k8s-${each.value.region}"
  parent_container_id = module.governance.folder_container_ids["platform"]
  labels              = var.labels
  region              = each.value.region
  role_assignments    = each.value.role_assignments
  cluster             = each.value.cluster
  observability       = each.value.observability
  encrypted_volumes   = each.value.encrypted_volumes
  debug_bastion       = each.value.debug_bastion

  network = {
    sna_enabled               = each.value.network.sna_enabled
    sna_network_area_id       = each.value.network.sna_network_area_id != null ? each.value.network.sna_network_area_id : try(module.connectivity[0].network_area_id[each.value.network.network_area_key], null)
    firewall_next_hop_ip      = try(module.connectivity[0].firewall_next_hop_ip[each.value.network.network_area_key], null)
    sna_network_prefix_length = each.value.network.sna_network_prefix_length
  }

  dns = {
    enabled      = each.value.dns.enabled
    create_zones = each.value.dns.create_zones
    zones        = length(each.value.dns.zones) > 0 ? each.value.dns.zones : compact(distinct([for lz in values(module.landing_zone) : try(lz.dns_zone_dns_name, null)]))
  }
}

module "platform_kubernetes_eu01" {
  source    = "./modules/platform-kubernetes"
  for_each  = var.connectivity_regions != null ? { for key, cluster in var.platform_kubernetes : key => cluster if cluster.region == "eu01" } : {}
  providers = { stackit = stackit.eu01 }

  owner_email         = var.owner_email
  organization_id     = var.organization_id
  naming_pattern      = "${var.company_code}-pltfm-k8s-eu01"
  parent_container_id = module.governance.folder_container_ids["platform"]
  labels              = var.labels
  region              = each.value.region
  role_assignments    = each.value.role_assignments
  cluster             = each.value.cluster
  observability       = each.value.observability
  encrypted_volumes   = each.value.encrypted_volumes
  debug_bastion       = each.value.debug_bastion
  network = {
    sna_enabled               = each.value.network.sna_enabled
    sna_network_area_id       = each.value.network.sna_network_area_id != null ? each.value.network.sna_network_area_id : try(module.connectivity_eu01[0].network_area_id[each.value.network.network_area_key], null)
    firewall_next_hop_ip      = try(module.connectivity_eu01[0].firewall_next_hop_ip[each.value.network.network_area_key], null)
    sna_network_prefix_length = each.value.network.sna_network_prefix_length
  }
  dns = each.value.dns
}

module "platform_kubernetes_eu02" {
  source    = "./modules/platform-kubernetes"
  for_each  = var.connectivity_regions != null ? { for key, cluster in var.platform_kubernetes : key => cluster if cluster.region == "eu02" } : {}
  providers = { stackit = stackit.eu02 }

  owner_email         = var.owner_email
  organization_id     = var.organization_id
  naming_pattern      = "${var.company_code}-pltfm-k8s-eu02"
  parent_container_id = module.governance.folder_container_ids["platform"]
  labels              = var.labels
  region              = each.value.region
  role_assignments    = each.value.role_assignments
  cluster             = each.value.cluster
  observability       = each.value.observability
  encrypted_volumes   = each.value.encrypted_volumes
  debug_bastion       = each.value.debug_bastion
  network = {
    sna_enabled               = each.value.network.sna_enabled
    sna_network_area_id       = each.value.network.sna_network_area_id != null ? each.value.network.sna_network_area_id : try(module.connectivity_eu02[0].network_area_id[each.value.network.network_area_key], null)
    firewall_next_hop_ip      = try(module.connectivity_eu02[0].firewall_next_hop_ip[each.value.network.network_area_key], null)
    sna_network_prefix_length = each.value.network.sna_network_prefix_length
  }
  dns = each.value.dns
}

###############
## SANDBOXES ##
###############

module "sandboxes" {
  source = "./modules/sandboxes"
  count  = length(var.sandboxes) > 0 ? 1 : 0

  naming_prefix       = "${var.company_code}-sbx"
  parent_container_id = module.governance.folder_container_ids["sandboxes"]
  sandboxes           = var.sandboxes
}

###################
## LANDING ZONES ##
###################

module "landing_zone" {
  source   = "./modules/landing-zone"
  for_each = var.connectivity_regions == null ? var.landing_zones : {}

  organization_id        = var.organization_id
  parent_container_id    = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern         = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  dns_zone_name          = try("${each.value.project_code}-${each.value.env}-${var.region}-${split(".", values(module.connectivity[0].dns_zone_dns_names)[0])[0]}.stackit.run", null)
  network_area_id        = each.value.corporate ? try(module.connectivity[0].network_area_id[each.value.network_area_key], null) : null
  corporate              = each.value.corporate
  owner_email            = each.value.owner_email
  labels                 = var.labels
  role_assignments       = each.value.role_assignments
  network_prefix_length  = each.value.network_prefix_length
  ipv4_nameservers       = try(module.connectivity[0].network_area_nameservers[each.value.network_area_key], null)
  custom_roles           = each.value.custom_roles
  observability          = each.value.observability
  secretsmanager_enabled = each.value.secretsmanager_enabled
  firewall_next_hop_ip   = var.connectivity != null && var.connectivity.firewall != null ? try(module.connectivity[0].firewall_next_hop_ip[each.value.network_area_key], null) : null # if firewall is enabled, pass the next hop IP to the landing zones for route configuration
}

module "landing_zone_eu01" {
  source    = "./modules/landing-zone"
  for_each  = var.connectivity_regions != null ? { for key, landing_zone in var.landing_zones : key => landing_zone if landing_zone.region == "eu01" } : {}
  providers = { stackit = stackit.eu01 }

  organization_id        = var.organization_id
  parent_container_id    = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern         = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  dns_zone_name          = try("${each.value.project_code}-${each.value.env}-eu01-${split(".", values(module.connectivity_eu01[0].dns_zone_dns_names)[0])[0]}.stackit.run", null)
  network_area_id        = each.value.corporate ? try(module.connectivity_eu01[0].network_area_id[each.value.network_area_key], null) : null
  corporate              = each.value.corporate
  owner_email            = each.value.owner_email
  labels                 = var.labels
  role_assignments       = each.value.role_assignments
  network_prefix_length  = each.value.network_prefix_length
  ipv4_nameservers       = try(module.connectivity_eu01[0].network_area_nameservers[each.value.network_area_key], null)
  custom_roles           = each.value.custom_roles
  observability          = each.value.observability
  secretsmanager_enabled = each.value.secretsmanager_enabled
  firewall_next_hop_ip   = try(module.connectivity_eu01[0].firewall_next_hop_ip[each.value.network_area_key], null)
}

module "landing_zone_eu02" {
  source    = "./modules/landing-zone"
  for_each  = var.connectivity_regions != null ? { for key, landing_zone in var.landing_zones : key => landing_zone if landing_zone.region == "eu02" } : {}
  providers = { stackit = stackit.eu02 }

  organization_id        = var.organization_id
  parent_container_id    = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern         = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  dns_zone_name          = try("${each.value.project_code}-${each.value.env}-eu02-${split(".", values(module.connectivity_eu02[0].dns_zone_dns_names)[0])[0]}.stackit.run", null)
  network_area_id        = each.value.corporate ? try(module.connectivity_eu02[0].network_area_id[each.value.network_area_key], null) : null
  corporate              = each.value.corporate
  owner_email            = each.value.owner_email
  labels                 = var.labels
  role_assignments       = each.value.role_assignments
  network_prefix_length  = each.value.network_prefix_length
  ipv4_nameservers       = try(module.connectivity_eu02[0].network_area_nameservers[each.value.network_area_key], null)
  custom_roles           = each.value.custom_roles
  observability          = each.value.observability
  secretsmanager_enabled = each.value.secretsmanager_enabled
  firewall_next_hop_ip   = try(module.connectivity_eu02[0].firewall_next_hop_ip[each.value.network_area_key], null)
}
