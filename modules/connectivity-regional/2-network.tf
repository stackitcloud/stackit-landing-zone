##############
## NETWORKS ##
##############

# will get auto assigned a free range from the network area 
resource "stackit_network" "hub" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "hub_network"
  routed     = true
}

################
## INTERFACES ##
################

resource "stackit_network_interface" "wan" {
  name       = "vtnet0_wan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.hub.network_id
  security   = false
}

resource "stackit_network_interface" "lan" {
  name       = "vtnet1_lan"
  project_id = stackit_resourcemanager_project.this.project_id
  network_id = stackit_network.hub.network_id
  security   = false
}

###############
## PUBLIC IP ##
###############

resource "stackit_public_ip" "wan-ip" {
  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.wan.network_interface_id
}
