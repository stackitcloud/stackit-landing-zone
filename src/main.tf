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
  federated_identity_providers = var.federated_identity_providers
}

##################
## CONNECTIVITY ##
##################

module "connectivity" {
  source = "./modules/connectivity"
  count  = var.connectivity != null ? 1 : 0

  owner_email         = var.owner_email
  naming_pattern      = "${var.company_code}-pltfm-hub-prod"
  parent_container_id = module.governance.folder_container_ids["platform"]
  organization_id     = var.organization_id
  labels              = var.labels
  dns_zones           = var.connectivity.dns_zones
  network_area        = var.connectivity.network_area
  firewall            = var.connectivity.firewall
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
  for_each = var.landing_zones

  organization_id       = var.organization_id
  parent_container_id   = each.value.corporate ? module.governance.folder_container_ids["landing_zones_corporate"] : module.governance.folder_container_ids["landing_zones_public"]
  naming_pattern        = "${var.company_code}-lz-${each.value.project_code}-${each.value.env}"
  dns_zone_name         = try("${each.value.project_code}-${each.value.env}-${var.region}-${split(".", values(module.connectivity[0].dns_zone_dns_names)[0])[0]}.stackit.run", null)
  network_area_id       = each.value.corporate ? try(module.connectivity[0].network_area_id, null) : null
  corporate             = each.value.corporate
  owner_email           = each.value.owner_email
  labels                = var.labels
  role_assignments      = each.value.role_assignments
  network_prefix_length = each.value.network_prefix_length
  custom_roles          = each.value.custom_roles
  firewall_next_hop_ip  = var.connectivity != null && var.connectivity.firewall != null ? module.connectivity[0].firewall_next_hop_ip : null # if firewall is enabled, pass the next hop IP to the landing zones for route configuration
}
