##################
## NETWORK AREA ##
##################

resource "stackit_network_area" "this" {
  organization_id = var.organization_id
  name            = var.network_area_name
  labels          = merge(var.labels, { "preview/routingtables" = "true" })
}

resource "stackit_network_area_region" "this" {
  organization_id = var.organization_id
  network_area_id = stackit_network_area.this.network_area_id

  ipv4 = {
    network_ranges        = var.network_ranges
    transfer_network      = var.transfer_network_range
    max_prefix_length     = var.max_prefix_length
    min_prefix_length     = var.min_prefix_length
    default_prefix_length = var.default_prefix_length
    default_nameservers   = var.default_nameservers
  }
}
