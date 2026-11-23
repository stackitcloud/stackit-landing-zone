################
## GOVERNANCE ##
################

# Preserve this module's exact address while removing the other root modules.
module "governance" {
  source = "../modules/governance"

  organization_id       = var.organization_id
  owner_email           = var.owner_email
  labels                = merge(var.labels, { landing_zone_accelerator = "true" })
  rm_folder_parent_id   = var.rm_folder_parent_id
  rm_folders            = var.retirement_phase == "remove_projects" ? var.rm_folders : {}
  organization_owners   = var.organization_owners
  organization_auditors = var.organization_auditors
}
