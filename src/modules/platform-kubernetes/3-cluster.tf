locals {
  use_sna = lower(var.network.mode) == "sna"

  effective_observability_instance_id = var.observability.enabled ? stackit_observability_instance.this[0].instance_id : null
  effective_dns_zones = var.dns.create_zones ? sort([
    for zone in values(stackit_dns_zone.ske_extension) : zone.dns_name
  ]) : local.dns_extension_zones
  default_node_pools = [
    {
      name               = "ha-a"
      machine_type       = "g3i.4"
      minimum            = 2
      maximum            = 2
      availability_zones = ["${var.region}-1"]
      volume_size        = 20
      volume_type        = "storage_premium_perf1"
      os_name            = "flatcar"
      labels             = {}
    },
    {
      name               = "ha-b"
      machine_type       = "g3i.4"
      minimum            = 2
      maximum            = 2
      availability_zones = ["${var.region}-2"]
      volume_size        = 20
      volume_type        = "storage_premium_perf1"
      os_name            = "flatcar"
      labels             = {}
    }
  ]
  effective_node_pools = length(var.cluster.node_pools) > 0 ? var.cluster.node_pools : local.default_node_pools
}

resource "stackit_ske_cluster" "this" {
  project_id             = stackit_resourcemanager_project.this.project_id
  region                 = var.region
  name                   = var.cluster.name
  depends_on             = [time_sleep.wait_for_network_area_membership, stackit_dns_zone.ske_extension]
  kubernetes_version_min = var.cluster.kubernetes_version_min
  node_pools             = local.effective_node_pools

  maintenance = {
    enable_kubernetes_version_updates    = var.cluster.maintenance.enable_kubernetes_version_updates
    enable_machine_image_version_updates = var.cluster.maintenance.enable_machine_image_version_updates
    start                                = var.cluster.maintenance.start
    end                                  = var.cluster.maintenance.end
  }

  network = local.use_sna ? {
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
      instance_id = local.effective_observability_instance_id
    }
    dns = {
      enabled = var.dns.enabled && length(local.effective_dns_zones) > 0
      zones   = local.effective_dns_zones
    }
  }
}

resource "stackit_ske_kubeconfig" "this" {
  project_id   = stackit_resourcemanager_project.this.project_id
  region       = var.region
  cluster_name = stackit_ske_cluster.this.name

  refresh        = true
  expiration     = 7200
  refresh_before = 1800
}
