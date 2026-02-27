##############
## NETWORKS ##
##############

# will get auto assigned a free range from the network area (needs to be, because for a public ip it needs to be routed)
resource "stackit_network" "wan" {
  project_id = stackit_resourcemanager_project.project.project_id
  name       = "wan_network"
  #ipv4_nameservers = ["208.67.222.222", "9.9.9.9"] provider bug
  routed = true

  depends_on = [stackit_network.lan]
}

# this is not used, because it is not routed (not reachable by other projects)
# the wan interface actually handles the internal and external traffic
# actually lan should be reachable internally and wan not
resource "stackit_network" "lan" {
  project_id       = stackit_resourcemanager_project.project.project_id
  name             = "lan_network"
  ipv4_nameservers = ["208.67.222.222", "9.9.9.9"]
  ipv4_prefix      = var.vnet_range
  ipv4_gateway     = var.firewall_ip
  routed           = false
}

################
## INTERFACES ##
################

# the firewall will see a private ip, because stackit handles NAT (public ip is not attached directly)
resource "stackit_network_interface" "wan" {
  project_id = stackit_resourcemanager_project.project.project_id
  network_id = stackit_network.wan.network_id
  security   = false
}

resource "stackit_network_interface" "lan" {
  project_id = stackit_resourcemanager_project.project.project_id
  network_id = stackit_network.lan.network_id
  ipv4       = var.firewall_ip
  security   = false
}

###############
## PUBLIC IP ##
###############

resource "stackit_public_ip" "wan-ip" {
  project_id           = stackit_resourcemanager_project.project.project_id
  network_interface_id = stackit_network_interface.wan.network_interface_id
}
