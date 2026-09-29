resource "stackit_secretsmanager_instance" "configurator" {
  project_id = var.project_id
  name       = "${var.name_prefix}-secrets"
  acls       = var.service_access_cidrs
  lifecycle {
    prevent_destroy = true
  }
}

# Bootstrap identity for provisioning policies; never bind this user to a customer runner.
resource "stackit_secretsmanager_user" "provisioner" {
  project_id    = var.project_id
  instance_id   = stackit_secretsmanager_instance.configurator.instance_id
  description   = "Configurator secret-policy provisioning"
  write_enabled = true
  rotate_when_changed = {
    generation = var.credential_generation
  }
}
