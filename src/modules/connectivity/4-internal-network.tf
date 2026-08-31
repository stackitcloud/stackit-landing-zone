#############
## NETWORK ##
#############

resource "stackit_network" "lan" {
  for_each = local.firewalls

  project_id       = stackit_resourcemanager_project.this[each.key].project_id
  name             = "lan-${each.key}"
  ipv4_prefix      = each.value.lan_network_range
  ipv4_nameservers = local.network_area_nameservers[each.key]
  routed           = true
}

resource "stackit_network_interface" "lan" {
  for_each = local.firewalls

  name       = "vtnet1_lan-${each.key}"
  project_id = stackit_resourcemanager_project.this[each.key].project_id
  network_id = stackit_network.lan[each.key].network_id
  ipv4       = local.firewall_lan_ips[each.key]
  security   = false
}

# security = false is mandatory here, not merely convenient: the CARP VIP answers from
# the virtual MAC 00:00:5e:00:01:<vhid>, and STACKIT port security cannot express a
# foreign MAC (allowed_addresses is IP-only)
resource "stackit_network_interface" "lan_backup" {
  for_each = local.ha_firewalls

  name       = "vtnet1_lan_backup-${each.key}"
  project_id = stackit_resourcemanager_project.this[each.key].project_id
  network_id = stackit_network.lan[each.key].network_id
  ipv4       = local.firewall_backup_lan_ips[each.key]
  security   = false
}
