#############
## NETWORK ##
#############

resource "stackit_network" "lan" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "lan_network"
  routed     = true
}

resource "stackit_network_interface" "lan" {
  name       = "vtnet1_lan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.lan.network_id
  security   = false
}