#############
## NETWORK ##
#############

resource "stackit_network" "lan" {
  count = var.firewall_enabled ? 1 : 0

  project_id = var.project_id
  name       = "lan_network"
  routed     = true
}

resource "stackit_network_interface" "lan" {
  count = var.firewall_enabled ? 1 : 0

  name       = "vtnet1_lan"
  project_id = var.project_id
  network_id = stackit_network.lan[0].network_id
  security   = false
}