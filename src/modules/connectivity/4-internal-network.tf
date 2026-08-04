#############
## NETWORK ##
#############

resource "stackit_network" "lan" {
  count = local.firewall_enabled ? 1 : 0

  project_id       = stackit_resourcemanager_project.this.project_id
  name             = "lan"
  ipv4_prefix      = var.firewall.lan_network_range
  ipv4_nameservers = local.network_area_nameservers
  routed           = true
}

resource "stackit_network_interface" "lan" {
  count = local.firewall_enabled ? 1 : 0

  name       = "vtnet1_lan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.lan[0].network_id
  ipv4       = local.firewall_lan_ip
  security   = false
}

# security = false is mandatory here, not merely convenient: the CARP VIP answers from
# the virtual MAC 00:00:5e:00:01:<vhid>, and STACKIT port security cannot express a
# foreign MAC (allowed_addresses is IP-only)
resource "stackit_network_interface" "lan_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  name       = "vtnet1_lan_backup"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.lan[0].network_id
  ipv4       = local.firewall_backup_lan_ip
  security   = false
}