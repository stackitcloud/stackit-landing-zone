#############
## NETWORK ##
#############
resource "stackit_network" "this" {
  count = var.network_area_id != null ? 1 : 0

  project_id         = stackit_resourcemanager_project.project.project_id
  name               = "${local.naming_pattern}-routed"
  ipv4_prefix_length = var.network_prefix_length
  routed             = true
}