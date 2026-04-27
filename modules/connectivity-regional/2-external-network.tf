#############
## ROUTING ##
#############

resource "stackit_routing_table" "wan" {
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  name            = "wan"
  system_routes   = true
}

resource "stackit_routing_table_route" "wan" {
  organization_id  = var.organization_id
  network_area_id  = var.network_area_id
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
  project_id       = stackit_resourcemanager_project.this.project_id
  name             = "wan_network"
  routing_table_id = stackit_routing_table.wan.routing_table_id
  routed           = true
}

resource "stackit_network_interface" "wan" {
  name       = "vtnet0_wan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.wan.network_id
  security   = false
}

resource "stackit_public_ip" "wan-ip" {
  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.wan.network_interface_id
}