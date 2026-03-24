##################
## NETWORK AREA ##
##################

locals {
  project_labels = merge(
    var.network_area_id != null ? { "networkArea" = var.network_area_id } : {},
    var.labels
  )
}

resource "stackit_network_area" "this" {
  for_each = { for na in var.network_areas : na.name => na }

  organization_id = var.organization_id
  name            = each.key
  labels          = length(local.project_labels) > 0 ? local.project_labels : null
}

resource "stackit_network_area_region" "this" {
  for_each = { for na in var.network_areas : na.name => na }

  organization_id = var.organization_id
  network_area_id = stackit_network_area.this[each.key].network_area_id

  ipv4 = {
    network_ranges        = each.value.network_ranges
    transfer_network      = each.value.transfer_network_range
    max_prefix_length     = each.value.max_prefix_length
    min_prefix_length     = each.value.min_prefix_length
    default_prefix_length = each.value.default_prefix_length
    default_nameservers   = each.value.default_nameservers
  }
}

############################
## NETWORK AREA - ROUTING ##
############################

resource "stackit_network_area_route" "this" {
  for_each = { for r in var.network_area_routes : r.name => r }

  organization_id = var.organization_id
  network_area_id = stackit_network_area.this[each.value.network_area_name].network_area_id

  destination = each.value.destination
  next_hop    = each.value.next_hop
}