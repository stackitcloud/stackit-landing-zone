#############
## ROUTING ##
#############

resource "time_sleep" "wait_for_network_area" {
  for_each = { for idx, na in var.network_areas : idx => na }

  create_duration = "20s"

  depends_on = [stackit_network_area.this]
}

resource "stackit_routing_table" "wan" {
  for_each = { for idx, na in var.network_areas : idx => na }

  organization_id = var.organization_id
  network_area_id = stackit_network_area.this[each.key].network_area_id
  name            = "wan-${each.key}"
  system_routes   = true

  depends_on = [time_sleep.wait_for_network_area]
}

resource "stackit_routing_table_route" "wan" {
  for_each = { for idx, na in var.network_areas : idx => na }

  organization_id  = var.organization_id
  network_area_id  = stackit_network_area.this[each.key].network_area_id
  routing_table_id = stackit_routing_table.wan[each.key].routing_table_id

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
  for_each = local.firewalls

  project_id       = stackit_resourcemanager_project.this[each.key].project_id
  name             = "wan_network-${each.key}"
  ipv4_prefix      = each.value.wan_network_range
  ipv4_nameservers = local.network_area_nameservers[each.key]
  routing_table_id = stackit_routing_table.wan[each.key].routing_table_id
  routed           = true
}

resource "stackit_network_interface" "wan" {
  for_each = local.firewalls

  name       = "vtnet0_wan-${each.key}"
  project_id = stackit_resourcemanager_project.this[each.key].project_id
  network_id = stackit_network.wan[each.key].network_id
  ipv4       = local.firewall_wan_ips[each.key]
  security   = false
}

resource "stackit_public_ip" "wan-ip" {
  for_each = local.firewalls

  project_id           = stackit_resourcemanager_project.this[each.key].project_id
  network_interface_id = stackit_network_interface.wan[each.key].network_interface_id
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
  for_each = local.ha_firewalls

  name       = "vtnet0_wan_backup-${each.key}"
  project_id = stackit_resourcemanager_project.this[each.key].project_id
  network_id = stackit_network.wan[each.key].network_id
  ipv4       = local.firewall_backup_wan_ips[each.key]
  security   = false
}

resource "stackit_public_ip" "wan-ip_backup" {
  for_each = local.ha_firewalls

  project_id           = stackit_resourcemanager_project.this[each.key].project_id
  network_interface_id = stackit_network_interface.wan_backup[each.key].network_interface_id
}
