resource "stackit_postgresflex_instance" "configurator" {
  project_id      = var.project_id
  name            = "${var.name_prefix}-db"
  flavor_id       = var.database.flavor_id
  version         = var.database.version
  backup_schedule = var.database.backup_schedule
  retention_days  = var.database.retention_days
  network = {
    acl = sort(tolist(var.database_access_cidrs))
  }
  storage = {
    class = var.database.storage_class
    size  = var.database.storage_size_gb
  }
  lifecycle {
    prevent_destroy = true
  }
}

# Database owner is for migrations only; application users and RLS are a separate runtime step.
resource "stackit_postgresflex_user" "migration" {
  project_id  = var.project_id
  instance_id = stackit_postgresflex_instance.configurator.instance_id
  username    = "configurator_migration"
  roles       = ["login"]
  rotate_when_changed = {
    generation = var.credential_generation
  }
}

resource "stackit_postgresflex_database" "configurator" {
  project_id  = var.project_id
  instance_id = stackit_postgresflex_instance.configurator.instance_id
  name        = "configurator"
  owner       = stackit_postgresflex_user.migration.username
  lifecycle {
    prevent_destroy = true
  }
}
