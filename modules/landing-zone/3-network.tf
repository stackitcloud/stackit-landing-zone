#############
## NETWORK ##
#############

resource "stackit_network" "this" {
  count = var.network_area_id != null ? 1 : 0

  project_id         = stackit_resourcemanager_project.this.project_id
  name               = "${var.naming_pattern}-routed"
  ipv4_prefix_length = var.network_prefix_length
  routed             = true
}