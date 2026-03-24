resource "stackit_ske_cluster" "this" {
  for_each = var.clusters

  project_id             = var.project_id
  name                   = each.key
  kubernetes_version_min = each.value.kubernetes_version_min
  region                 = each.value.region
  node_pools             = each.value.node_pools
  maintenance            = each.value.maintenance

  network = {
    id = each.value.network_id
    control_plane = {
      access_scope = each.value.public_access_enabled ? "PUBLIC" : "SNA"
    }
  }

  extensions   = each.value.extensions
  hibernations = each.value.hibernations
}
