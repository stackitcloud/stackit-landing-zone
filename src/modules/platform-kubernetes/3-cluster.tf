locals {
  effective_dns_zones = var.dns.create_zones ? sort([
    for zone in values(stackit_dns_zone.ske_extension) : zone.dns_name
  ]) : local.dns_extension_zones
}

resource "stackit_ske_cluster" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  region     = var.region
  name       = var.cluster.name

  kubernetes_version_min = var.cluster.kubernetes_version_min
  node_pools             = var.cluster.node_pools

  maintenance = var.cluster.maintenance

  network = var.network.sna_enabled ? {
    id = stackit_network.sna[0].network_id
    control_plane = {
      access_scope = "SNA"
    }
    } : {
    id = null
    control_plane = {
      access_scope = "PUBLIC"
    }
  }

  extensions = {
    observability = {
      enabled     = var.observability.enabled
      instance_id = var.observability.enabled ? stackit_observability_instance.this[0].instance_id : null
    }
    dns = {
      enabled = var.dns.enabled && length(local.effective_dns_zones) > 0
      zones   = local.effective_dns_zones
    }
  }

  depends_on = [
    time_sleep.wait_for_network_area_membership,
    stackit_dns_zone.ske_extension,
  ]
}

resource "stackit_ske_kubeconfig" "this" {
  project_id   = stackit_resourcemanager_project.this.project_id
  region       = var.region
  cluster_name = stackit_ske_cluster.this.name

  refresh        = true
  expiration     = 7200
  refresh_before = 1800
}
