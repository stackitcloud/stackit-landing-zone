##################
## NETWORK AREA ##
##################

resource "stackit_network_area" "areas" {
  for_each = { for na in var.network_areas : na.name => na }

  organization_id = var.organization_id
  name            = "${local.naming_pattern}-${each.key}"
  labels          = length(local.project_labels) > 0 ? local.project_labels : null
}

resource "stackit_network_area_region" "areas" {
  for_each = { for na in var.network_areas : na.name => na }

  organization_id = var.organization_id
  network_area_id = stackit_network_area.areas[each.key].network_area_id

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

# resource "stackit_network_area_route" "main" {
#   organization_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#   network_area_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#   prefix          = "192.168.0.0/24"
#   next_hop        = "192.168.0.0"
#   labels = {
#     "key" = "value"
#   }
# }