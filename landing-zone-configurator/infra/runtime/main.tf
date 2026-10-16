provider "stackit" {
  default_region = var.region
}
# Credentials come from the private platform outputs, through CF_* environment variables.
provider "cloudfoundry" {}

resource "cloudfoundry_space" "configurator" {
  name      = "configurator"
  org       = var.cf_org_id
  allow_ssh = false
  lifecycle {
    prevent_destroy = true
  }
}
# CF requires organization membership even for an existing org manager.
resource "cloudfoundry_org_role" "deployer_member" {
  org      = var.cf_org_id
  username = var.cf_username
  type     = "organization_user"
}
resource "cloudfoundry_space_role" "deployer" {
  depends_on = [cloudfoundry_org_role.deployer_member]
  space      = cloudfoundry_space.configurator.id
  username   = var.cf_username
  type       = "space_developer"
}
resource "stackit_postgresflex_user" "application" {
  project_id  = var.project_id
  instance_id = var.database_instance_id
  username    = "configurator_app"
  roles       = ["login"]
  rotate_when_changed = {
    generation = var.credential_generation
  }
}
resource "stackit_secretsmanager_user" "application" {
  project_id    = var.project_id
  instance_id   = var.secrets_instance_id
  description   = "Configurator session token storage"
  write_enabled = true
  rotate_when_changed = {
    generation = var.credential_generation
  }
}
data "stackit_postgresflex_instance" "configurator" {
  project_id  = var.project_id
  instance_id = var.database_instance_id
}
