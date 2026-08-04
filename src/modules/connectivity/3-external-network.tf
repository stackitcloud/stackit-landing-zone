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
  count = local.firewall_enabled ? 1 : 0

  project_id       = stackit_resourcemanager_project.this.project_id
  name             = "wan_network"
  ipv4_prefix      = var.firewall.wan_network_range
  ipv4_nameservers = local.network_area_nameservers
  routing_table_id = stackit_routing_table.wan.routing_table_id
  routed           = true
}

resource "stackit_network_interface" "wan" {
  count = local.firewall_enabled ? 1 : 0

  name       = "vtnet0_wan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.wan[0].network_id
  ipv4       = local.firewall_wan_ip
  security   = false
}

resource "stackit_public_ip" "wan-ip" {
  count = local.firewall_enabled ? 1 : 0

  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.wan[0].network_interface_id
}

#################
## BACKUP NODE ##
#################

# The backup's own public IP serves three purposes: the appliance is reachable for the
# per-node HA configuration before any policy exists, egress NAT keeps working when the
# backup is MASTER (translated to its own address), and inbound can be failed over
# manually by repointing DNS. The primary's public IP does NOT move automatically —
# STACKIT binds a public IP 1:1 to a NIC and has no floating construct.
resource "stackit_network_interface" "wan_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  name       = "vtnet0_wan_backup"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.wan[0].network_id
  ipv4       = local.firewall_backup_wan_ip
  security   = false
}

resource "stackit_public_ip" "wan-ip_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.wan_backup[0].network_interface_id
}