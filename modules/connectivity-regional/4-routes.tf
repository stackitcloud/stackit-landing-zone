#########################
## NETWORK AREA ROUTES ##
#########################

# Default route: send all non-local traffic from the network area through pfSense
# This enables project-to-internet and project-to-project routing via the firewall
resource "stackit_network_area_route" "default" {
  organization_id = var.organization_id
  network_area_id = var.network_area_id
  destination = {
    type  = "cidrv4"
    value = "0.0.0.0/0"
  }
  next_hop = {
    type  = "ipv4"
    value = stackit_network_interface.wan.ipv4
  }
}
