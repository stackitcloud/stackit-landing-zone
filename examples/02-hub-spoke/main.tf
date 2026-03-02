################
## GOVERNANCE ##
################

module "governance" {
  source = "../../modules/governance"

  owner_email           = var.owner_email
  company_name          = var.company_name
  organization_id       = var.organization_id
  labels                = var.labels
  region                = var.region
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors
  platform_admins       = var.platform_admins
  landing_zone_admins   = var.landing_zone_admins
}

################
## MANAGEMENT ##
################

module "management" {
  source = "../../modules/management"

  owner_email           = var.owner_email
  project_code          = "mgmt"
  company_code          = var.company_code
  parent_container_id   = module.governance.folder_container_ids.platform
  organization_id       = var.organization_id
  labels                = var.labels
  region                = var.region
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors
}

###########################
## CONNECTIVITY - GLOBAL ##
###########################

module "connectivity_global" {
  source = "../../modules/connectivity-global"

  owner_email           = var.owner_email
  project_name          = "${var.company_name} Connectivity"
  project_code          = "conn"
  company_name          = var.company_name
  company_code          = var.company_code
  parent_container_id   = module.governance.folder_container_ids.platform
  organization_id       = var.organization_id
  labels                = var.labels
  region                = var.region
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors
  network_areas         = var.network_areas
}

#############################
## CONNECTIVITY - REGIONAL ##
#############################

module "connectivity_regional" {
  source = "../../modules/connectivity-regional"

  owner_email         = var.owner_email
  project_name        = "${var.company_name} Connectivity Regional"
  project_code        = "conn-reg"
  company_name        = var.company_name
  company_code        = var.company_code
  parent_container_id = module.governance.folder_container_ids.platform
  organization_id     = var.organization_id
  network_area_id     = module.connectivity_global.network_area_ids[var.connectivity_regional_network_area]
  labels              = var.labels
  region              = var.region
  firewall_zone       = var.firewall_zone
  firewall_flavor     = var.firewall_flavor
  vnet_range          = var.connectivity_vnet_range
  firewall_ip         = var.firewall_ip
}

############
## DEVOPS ##
############

module "devops" {
  source = "../../modules/devops"

  owner_email           = var.owner_email
  project_name          = "${var.company_name} DevOps"
  project_code          = "devops"
  company_name          = var.company_name
  company_code          = var.company_code
  parent_container_id   = module.governance.folder_container_ids.platform
  organization_id       = var.organization_id
  labels                = var.labels
  region                = var.region
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors
}

###############
## SANDBOXES ##
###############

module "sandboxes" {
  source = "../../modules/sandboxes"

  company_code        = var.company_code
  parent_container_id = module.governance.folder_container_ids.sandbox
  labels              = var.labels
  region              = var.region
  sandboxes           = var.sandboxes
}

###################
## LANDING ZONES ##
###################

module "landing_zone" {
  source   = "../../modules/landing-zone"
  for_each = var.landing_zones

  project_name          = each.value.project_name
  project_code          = each.value.project_code
  company_code          = var.company_code
  parent_container_id   = each.value.corporate ? module.governance.folder_container_ids.landing_zones_corporate : module.governance.folder_container_ids.landing_zones_public
  owner_email           = each.value.owner_email
  labels                = var.labels
  region                = var.region
  network_area_id       = each.value.corporate ? module.connectivity_global.network_area_ids[var.connectivity_regional_network_area] : null
  env                   = each.value.env
  role_assignments      = each.value.role_assignments
  network_prefix_length = each.value.network_prefix_length
  custom_roles          = each.value.custom_roles
  kubernetes_clusters   = each.value.kubernetes_clusters
}
