#############
## ROUTING ##
#############
resource "stackit_routing_table" "this" {
  count           = var.network_area_id != null ? 1 : 0
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  name            = var.naming_pattern
  system_routes   = false 

  labels = local.labels
}

resource "stackit_routing_table_route" "this" {
  count            = var.network_area_id != null ? 1 : 0
  routing_table_id = stackit_routing_table.this[0].routing_table_id

  organization_id = var.organization_id
  network_area_id = var.network_area_id

  destination = {
    type  = "cidrv4"
    value = "0.0.0.0/0"
  }

  next_hop = {
    type  = "ipv4"
    value = var.firewall_next_hop_ip
  }

  labels = local.labels
}

#############
## NETWORK ##
#############
resource "stackit_network" "this" {
  count      = var.network_area_id != null ? 1 : 0
  project_id = stackit_resourcemanager_project.this.project_id

  name               = "${var.naming_pattern}-routed"
  ipv4_prefix_length = var.network_prefix_length
  routed             = true
  ipv4_nameservers   = var.ipv4_nameservers
  routing_table_id   = stackit_routing_table.this[0].routing_table_id

  labels = local.labels
}
