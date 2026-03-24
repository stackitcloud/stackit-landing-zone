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

  organization_id = var.organization_id
  labels          = var.labels
  network_areas   = var.network_areas
}

#############################
## CONNECTIVITY - REGIONAL ##
#############################

module "connectivity_regional" {
  source = "../../modules/connectivity-regional"

  owner_email         = var.owner_email
  naming_pattern      = "${var.company_code}-pltfm-hub-prod"
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  network_area_id     = module.connectivity_global.network_area_ids[var.connectivity_regional_network_area]
  labels              = var.labels
  firewall_zone       = var.firewall_zone
  firewall_flavor     = var.firewall_flavor
  vnet_range          = var.connectivity_vnet_range
  firewall_ip         = var.firewall_ip

  # for multiple regions define alias
}

############
## DEVOPS ##
############

module "devops" {
  source = "../../modules/devops"

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

  parent_container_id   = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern        = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  network_area_id       = each.value.corporate ? module.connectivity_global.network_area_ids[var.connectivity_regional_network_area] : null
  owner_email           = each.value.owner_email
  labels                = var.labels
  role_assignments      = each.value.role_assignments
  network_prefix_length = each.value.network_prefix_length
  custom_roles          = each.value.custom_roles
}
