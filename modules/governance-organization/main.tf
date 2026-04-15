resource "stackit_authorization_organization_role_assignment" "this" {
  for_each = var.members

  resource_id = var.organization_id
  role        = each.value
  subject     = each.key
}

# resource "stackit_network_area" "this" {
#   for_each = var.network_areas

#   organization_id = var.organization_id
#   name            = each.key
# }

# resource "stackit_network_area_region" "this" {
#   for_each = var.network_areas

#   organization_id = var.organization_id
#   network_area_id = stackit_network_area.this[each.key].network_area_id
#   region = "eu01"

#   ipv4 = {
#     transfer_network = each.value.transfer_network
#     network_ranges   = each.value.network_ranges
#     #network_ranges   = [ for range in each.value.network_ranges : {"prefix" = range} ]
#     default_nameservers   = ["8.8.8.8"]
#     default_prefix_length = 25
#     max_prefix_length     = 29
#     min_prefix_length     = 24
#   }
# }