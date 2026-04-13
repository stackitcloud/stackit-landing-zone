#############
## NETWORK ##
#############
resource "stackit_network" "this" {
  project_id  = stackit_resourcemanager_project.this.project_id
  name        = "${var.name}-default"
  ipv4_prefix = var.network_prefix
  routed      = true
}
