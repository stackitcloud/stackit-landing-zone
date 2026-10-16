variable "runner_cf_org_id" {
  type = string
}
variable "runner_cf_username" {
  type      = string
  sensitive = true
}
variable "runner_cf_password" {
  type      = string
  sensitive = true
}
provider "cloudfoundry" {
  alias    = "runners"
  api_url  = "https://api.system.01.cf.eu01.stackit.cloud"
  user     = var.runner_cf_username
  password = var.runner_cf_password
}
resource "cloudfoundry_space" "plan_runners" {
  provider  = cloudfoundry.runners
  name      = "plans"
  org       = var.runner_cf_org_id
  allow_ssh = false
  lifecycle {
    prevent_destroy = true
  }
}
resource "cloudfoundry_org_role" "runner_member" {
  provider = cloudfoundry.runners
  org      = var.runner_cf_org_id
  username = var.runner_cf_username
  type     = "organization_user"
}
resource "cloudfoundry_space_role" "runner_developer" {
  provider   = cloudfoundry.runners
  depends_on = [cloudfoundry_org_role.runner_member]
  space      = cloudfoundry_space.plan_runners.id
  username   = var.runner_cf_username
  type       = "space_developer"
}
output "runner_space" {
  value = { id = cloudfoundry_space.plan_runners.id, name = cloudfoundry_space.plan_runners.name, org_id = var.runner_cf_org_id }
}
