#############
## PROJECT ##
#############

resource "stackit_resourcemanager_project" "this" {
  parent_container_id = var.parent_container_id
  name                = var.name
  owner_email         = var.owner_email
  labels              = var.labels

  lifecycle {
    ignore_changes = [
      labels
    ]
  }
}

resource "stackit_authorization_project_role_assignment" "assignments" {
 for_each = var.members

 resource_id = stackit_resourcemanager_project.this.project_id
 role        = each.value
 subject     = each.key
}