############
## ROUTES ##
############

resource "opnsense_route" "this" {
  for_each = var.routes

  enabled     = each.value.enabled
  network     = each.value.network
  gateway     = each.value.gateway
  description = each.value.description != null ? each.value.description : each.key
}
