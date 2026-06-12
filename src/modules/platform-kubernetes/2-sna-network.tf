resource "stackit_network" "sna" {
  count = local.use_sna ? 1 : 0

  project_id         = stackit_resourcemanager_project.this.project_id
  name               = "${var.cluster.name}-sna"
  ipv4_prefix_length = var.network.sna_network_prefix_length
  routed             = true
}
