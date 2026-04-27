################
## GOVERNANCE ##
################

module "governance" {
  source = "../../modules/governance"

  owner_email           = var.owner_email
  organization_id       = var.organization_id
  labels                = var.labels
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors

  rm_folders = {
    platform = {
      name          = "Platform"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_corporate = {
      name          = "Landing Zones - Corporate"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_public = {
      name          = "Landing Zones - Public"
      owner_emails  = []
      reader_emails = []
    }
    sandboxes = {
      name          = "Sandboxes"
      owner_emails  = []
      reader_emails = []
    }
  }
}

################
## MANAGEMENT ##
################

module "management" {
  source = "../../modules/management"

  owner_email         = var.owner_email
  naming_pattern      = "${var.company_code}-pltfm-mgmt-prod"
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
}

###########################
## CONNECTIVITY - GLOBAL ##
###########################

module "connectivity_global" {
  source = "../../modules/connectivity-global"

  owner_email         = var.owner_email
  naming_pattern      = "${var.company_code}-pltfm-net-prod"
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
}

#############################
## CONNECTIVITY - REGIONAL ##
#############################

module "connectivity_regional" {
  source = "../../modules/connectivity-regional"

  project_id             = module.connectivity_global.project_id
  organization_id        = var.organization_id
  network_area_name      = var.network_area_name
  network_ranges         = var.network_ranges
  transfer_network_range = var.transfer_network_range
  min_prefix_length      = var.min_prefix_length
  max_prefix_length      = var.max_prefix_length
  default_prefix_length  = var.default_prefix_length
  labels                 = var.labels
  firewall_enabled       = var.firewall_enabled
  firewall_zone          = var.firewall_zone
  firewall_flavor        = var.firewall_flavor
  vnet_range             = var.connectivity_vnet_range
  firewall_ip            = var.firewall_ip
}

############
## DEVOPS ##
############

module "devops" {
  source = "../../modules/devops"
  count  = var.devops_enabled ? 1 : 0

  owner_email         = var.owner_email
  naming_pattern      = "${var.company_code}-pltfm-devops-prod"
  company_name        = var.company_name
  parent_container_id = module.governance.folder_container_ids["platform"]
  labels              = var.labels
}

###############
## SANDBOXES ##
###############

module "sandboxes" {
  source = "../../modules/sandboxes"
  count  = length(var.sandboxes) > 0 ? 1 : 0

  naming_prefix       = "${var.company_code}-sbx"
  parent_container_id = module.governance.folder_container_ids["sandboxes"]
  sandboxes           = var.sandboxes
}

###################
## LANDING ZONES ##
###################

module "landing_zone" {
  source   = "../../modules/landing-zone"
  for_each = var.landing_zones

  organization_id       = var.organization_id 
  parent_container_id   = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern        = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  network_area_id       = each.value.corporate ? module.connectivity_regional.network_area_id : null
  owner_email           = each.value.owner_email
  labels                = var.labels
  role_assignments      = each.value.role_assignments
  network_prefix_length = each.value.network_prefix_length
  custom_roles          = each.value.custom_roles
  firewall_next_hop_ip  = module.connectivity_regional.firewall_next_hop_ip
}
