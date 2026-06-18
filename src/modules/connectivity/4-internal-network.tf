#############
## NETWORK ##
#############

resource "stackit_network" "lan" {
  count = local.firewall_enabled ? 1 : 0

  project_id  = stackit_resourcemanager_project.this.project_id
  name        = "lan_network"
  ipv4_prefix = var.firewall.lan_network_range
  routed      = true
}

resource "stackit_network_interface" "lan" {
  count = local.firewall_enabled ? 1 : 0

  name       = "vtnet1_lan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.lan[0].network_id
  ipv4       = coalesce(var.firewall.lan_ip, cidrhost(var.firewall.lan_network_range, 4))
  security   = false
}