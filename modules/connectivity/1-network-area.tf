##################
## NETWORK AREA ##
##################

resource "stackit_network_area" "this" {
  organization_id = var.organization_id
  name            = var.network_area_name != null ? var.network_area_name : var.naming_pattern
  labels          = merge(var.labels, { "preview/routingtables" = "true" })
}

resource "stackit_network_area_region" "this" {
  organization_id = var.organization_id
  network_area_id = stackit_network_area.this.network_area_id

  ipv4 = {
    network_ranges        = [for r in var.network_area.ranges : { prefix = r }]
    transfer_network      = var.network_area.transfer_network
    max_prefix_length     = var.network_area.max_prefix_length
    min_prefix_length     = var.network_area.min_prefix_length
    default_prefix_length = var.network_area.default_prefix_length
    default_nameservers   = var.network_area.default_nameservers
  }
}
