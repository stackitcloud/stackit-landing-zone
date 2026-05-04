#############
## PROJECT ##
#############

locals {
  project_labels = merge(
    { "networkArea" = stackit_network_area.this.network_area_id },
    var.labels
  )
  labels = length(local.project_labels) > 0 ? local.project_labels : null # provider bug: empty map becomes null after apply
}

resource "stackit_resourcemanager_project" "this" {
  parent_container_id = var.parent_container_id
  name                = var.project_name != null ? var.project_name : var.naming_pattern
  owner_email         = var.owner_email
  labels              = local.labels
}

resource "stackit_authorization_project_role_assignment" "this" {
  for_each = { for assignment in var.role_assignments : "${assignment.role}-${assignment.subject}" => assignment }

  resource_id = stackit_resourcemanager_project.this.project_id
  role        = each.value.role
  subject     = each.value.subject
}

###############
## DNS ZONES ##
###############

resource "stackit_dns_zone" "this" {
  for_each = var.dns_zones

  project_id    = stackit_resourcemanager_project.this.project_id
  name          = each.value.name != null ? each.value.name : each.value.dns_name
  dns_name      = each.value.dns_name
  contact_email = each.value.contact_email
  type          = each.value.type
  acl           = each.value.acl
  description   = each.value.description
  default_ttl   = each.value.default_ttl
}
