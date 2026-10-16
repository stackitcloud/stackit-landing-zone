resource "stackit_scf_organization" "configurator" {
  project_id  = var.project_id
  name        = var.name_prefix
  platform_id = var.cf_platform_id
  quota_id    = var.cf_quota_id
  lifecycle {
    prevent_destroy = true
  }
}

resource "stackit_scf_organization_manager" "configurator" {
  project_id = var.project_id
  org_id     = stackit_scf_organization.configurator.org_id
}

data "stackit_scf_platform" "configurator" {
  project_id  = var.project_id
  platform_id = var.cf_platform_id
}
