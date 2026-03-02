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
  parent_container_id   = module.governance.folder_container_ids.landing_zones_public
  owner_email           = each.value.owner_email
  labels                = var.labels
  region                = var.region
  env                   = each.value.env
  role_assignments      = each.value.role_assignments
  network_prefix_length = each.value.network_prefix_length
  custom_roles          = each.value.custom_roles
  kubernetes_clusters   = each.value.kubernetes_clusters
}
