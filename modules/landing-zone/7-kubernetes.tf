#########################
## KUBERNETES CLUSTERS ##
#########################

resource "stackit_ske_cluster" "this" {
  for_each = var.kubernetes_clusters

  project_id             = stackit_resourcemanager_project.project.project_id
  name                   = each.key
  kubernetes_version_min = each.value.kubernetes_version
  node_pools             = each.value.node_pools

  maintenance = {
    enable_kubernetes_version_updates    = each.value.enable_kubernetes_version_updates
    enable_machine_image_version_updates = each.value.enable_machine_image_version_updates
    start                                = "01:00:00Z"
    end                                  = "02:00:00Z"
  }

  hibernations = each.value.hibernations

  extensions = each.value.extensions

  network = var.network_area_id != null ? { id = stackit_network.this[0].network_id } : null
}