#############
## PROJECT ##
#############

locals {
  project_labels = { for idx, na in var.network_areas : idx => merge(
    {
      "networkArea"    = stackit_network_area.this[idx].network_area_id
      "networkAreaKey" = idx
    },
    var.labels
  ) }
  labels = { for idx, na in var.network_areas : idx => length(local.project_labels[idx]) > 0 ? local.project_labels[idx] : null }
  role_assignments = {
    for pair in setproduct(keys(var.network_areas), range(length(var.role_assignments))) :
    "${pair[0]}/${pair[1]}" => {
      network_area_key = pair[0]
      role             = var.role_assignments[pair[1]].role
      subject          = var.role_assignments[pair[1]].subject
    }
  }
}

resource "stackit_resourcemanager_project" "this" {
  for_each = { for idx, na in var.network_areas : idx => na }

  parent_container_id = var.parent_container_id
  name                = var.project_name != null && length(var.network_areas) == 1 ? var.project_name : "${coalesce(var.project_name, var.naming_pattern)}-${each.key}"
  owner_email         = var.owner_email
  labels              = local.labels[each.key]
}

resource "stackit_authorization_project_role_assignment" "this" {
  for_each = local.role_assignments

  resource_id = stackit_resourcemanager_project.this[each.value.network_area_key].project_id
  role        = each.value.role
  subject     = each.value.subject
}
