#############
## ROUTING ##
#############

resource "stackit_routing_table" "wan" {
  organization_id = var.organization_id
  network_area_id = stackit_network_area.this.network_area_id
  name            = "wan"
  system_routes   = true
}

resource "stackit_routing_table_route" "wan" {
  organization_id  = var.organization_id
  network_area_id  = stackit_network_area.this.network_area_id
  routing_table_id = stackit_routing_table.wan.routing_table_id

  destination = {
    type  = "cidrv4"
    value = "0.0.0.0/0"
  }

  next_hop = {
    type = "internet"
  }
}

#############
## NETWORK ##
#############

resource "stackit_network" "wan" {
  count = var.firewall_enabled ? 1 : 0

  project_id       = var.project_id
  name             = "wan_network"
  routing_table_id = stackit_routing_table.wan.routing_table_id
  routed           = true
}

resource "stackit_network_interface" "wan" {
  count = var.firewall_enabled ? 1 : 0

  name       = "vtnet0_wan"
  project_id = var.project_id
  network_id = stackit_network.wan[0].network_id
  security   = false
}

resource "stackit_public_ip" "wan-ip" {
  count = var.firewall_enabled ? 1 : 0

  project_id           = var.project_id
  network_interface_id = stackit_network_interface.wan[0].network_interface_id
}