# The CI identity is limited to this operator project; it cannot provision sibling projects.
resource "stackit_service_account" "provisioning" {
  project_id = stackit_resourcemanager_project.configurator.project_id
  name       = var.project_name == "Landing Zone Configurator - Prod" ? "lzc-prod-provisioner" : "lzc-dev-provisioner"
}

resource "stackit_authorization_project_role_assignment" "provisioning" {
  resource_id = stackit_resourcemanager_project.configurator.project_id
  role        = "owner"
  subject     = stackit_service_account.provisioning.email
}

resource "stackit_service_account_key" "provisioning" {
  project_id            = stackit_resourcemanager_project.configurator.project_id
  service_account_email = stackit_service_account.provisioning.email
  ttl_days              = 90
  rotate_when_changed   = { generation = var.credential_generation }

  lifecycle {
    create_before_destroy = true
  }
}
