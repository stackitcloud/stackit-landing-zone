resource "stackit_observability_instance" "this" {
  count = var.observability.enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = var.observability.name != null ? var.observability.name : var.naming_pattern
  plan_name  = var.observability.plan_name
  acl        = var.observability.acl
}
