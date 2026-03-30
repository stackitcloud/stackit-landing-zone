#########################
## NETWORK AREA ROUTES ##
#########################

resource "stackit_network_area_route" "rfc1918_10" {
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  destination = { type = "cidrv4", value = "10.0.0.0/8" }
  next_hop    = { type = "ipv4",   value = stackit_network_interface.lan.ipv4 }
}

resource "stackit_network_area_route" "rfc1918_172" {
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  destination = { type = "cidrv4", value = "172.16.0.0/12" }
  next_hop    = { type = "ipv4",   value = stackit_network_interface.lan.ipv4 }
}

resource "stackit_network_area_route" "rfc1918_192" {
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  destination = { type = "cidrv4", value = "192.168.0.0/16" }
  next_hop    = { type = "ipv4",   value = stackit_network_interface.lan.ipv4 }
}