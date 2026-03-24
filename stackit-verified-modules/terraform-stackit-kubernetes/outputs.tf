output "clusters" {
  description = "Map of created SKE clusters with their key attributes."
  value = {
    for name, cluster in stackit_ske_cluster.this : name => {
      id                      = cluster.id
      name                    = cluster.name
      kubernetes_version_used = cluster.kubernetes_version_used
      egress_address_ranges   = cluster.egress_address_ranges
      pod_address_ranges      = cluster.pod_address_ranges
    }
  }
}
