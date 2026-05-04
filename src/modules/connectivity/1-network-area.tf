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

# This gives STACKIT time to de-register projects that were attached to the network area
# Error: Network area ready for deletion waiting: found non-GenericOpenApiError: network area with id ... has still active projects
resource "time_sleep" "wait_before_network_area_region_destroy" {
  destroy_duration = "120s"

  depends_on = [stackit_network_area_region.this]
}
