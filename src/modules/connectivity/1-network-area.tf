##################
## NETWORK AREA ##
##################

locals {
  # STACKIT runs its own resolvers per region and recommends them over public ones.
  # Regions not listed here have to bring their own network_area.default_nameservers.
  stackit_regional_nameservers = {
    eu01 = ["192.214.161.53", "213.17.17.17", "188.34.111.111"]
    eu02 = ["45.137.172.101", "45.137.172.102", "45.137.172.103"]
  }

  network_area_nameservers = { for idx, na in var.network_areas : idx => (
    na.default_nameservers != null
    ? na.default_nameservers
    : lookup(local.stackit_regional_nameservers, var.region, [])
  ) }
}

resource "stackit_network_area" "this" {
  for_each = { for idx, na in var.network_areas : idx => na }

  organization_id = var.organization_id
  name            = each.value.name != null ? each.value.name : "${var.naming_pattern}-${each.key}"
  labels          = merge(var.labels, { "preview/routingtables" = "true" })
}

resource "stackit_network_area_region" "this" {
  for_each = { for idx, na in var.network_areas : idx => na }

  organization_id = var.organization_id
  network_area_id = stackit_network_area.this[each.key].network_area_id
  region          = var.region

  ipv4 = {
    network_ranges        = [for r in each.value.ranges : { prefix = r }]
    transfer_network      = each.value.transfer_network
    max_prefix_length     = each.value.max_prefix_length
    min_prefix_length     = each.value.min_prefix_length
    default_prefix_length = each.value.default_prefix_length
    default_nameservers   = lookup(local.network_area_nameservers, each.key, [])
  }

  lifecycle {
    precondition {
      condition     = length(local.network_area_nameservers[each.key]) > 0
      error_message = "No STACKIT resolvers are known for region ${var.region}. Set connectivity.network_area.default_nameservers explicitly."
    }
  }
}

# This gives STACKIT time to de-register projects that were attached to the network area
# Error: Network area ready for deletion waiting: found non-GenericOpenApiError: network area with id ... has still active projects
resource "time_sleep" "wait_before_network_area_region_destroy" {
  for_each         = { for idx, na in var.network_areas : idx => na }
  destroy_duration = "180s"

  depends_on = [stackit_network_area_region.this]
}
