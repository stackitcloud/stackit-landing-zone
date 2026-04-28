#############
## ROUTING ##
#############

resource "time_sleep" "wait_for_network_area" {
  create_duration = "20s"

  depends_on = [stackit_network_area.this]
}

resource "stackit_routing_table" "wan" {
  organization_id = var.organization_id
  network_area_id = stackit_network_area.this.network_area_id
  name            = "wan"
  system_routes   = true

  depends_on = [time_sleep.wait_for_network_area]
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
  count = var.firewall != null ? 1 : 0

  project_id       = stackit_resourcemanager_project.this.project_id
  name             = "wan_network"
  ipv4_prefix      = var.firewall.wan_prefix
  routing_table_id = stackit_routing_table.wan.routing_table_id
  routed           = true
}

resource "stackit_network_interface" "wan" {
  count = var.firewall != null ? 1 : 0

  name       = "vtnet0_wan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.wan[0].network_id
  ipv4       = var.firewall.wan_ip
  security   = false
}

resource "stackit_public_ip" "wan-ip" {
  count = var.firewall != null ? 1 : 0

  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.wan[0].network_interface_id
}