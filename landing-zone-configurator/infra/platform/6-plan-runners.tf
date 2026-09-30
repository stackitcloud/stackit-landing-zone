# Dedicated CF organisation: its manager cannot inspect the Configurator app bindings.
resource "stackit_scf_organization" "plan_runners" {
  project_id  = var.project_id
  name        = "${var.name_prefix}-runners"
  platform_id = var.cf_platform_id
  quota_id    = var.cf_quota_id
  lifecycle {
    prevent_destroy = true
  }
}
resource "stackit_scf_organization_manager" "plan_runners" {
  project_id = var.project_id
  org_id     = stackit_scf_organization.plan_runners.org_id
}
output "plan_runner_cf" {
  description = "Plan dispatcher only. Never inject these into a customer runner."
  sensitive   = true
  value = {
    api_url  = data.stackit_scf_platform.configurator.api_url
    org_id   = stackit_scf_organization.plan_runners.org_id
    username = stackit_scf_organization_manager.plan_runners.username
    password = stackit_scf_organization_manager.plan_runners.password
  }
}
