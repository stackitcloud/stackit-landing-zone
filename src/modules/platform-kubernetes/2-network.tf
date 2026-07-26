locals {
  dns_extension_zones = distinct(compact(var.dns.zones))
}

resource "stackit_dns_zone" "ske_extension" {
  for_each = var.dns.create_zones ? { for zone in local.dns_extension_zones : zone => zone } : {}

  project_id    = stackit_resourcemanager_project.this.project_id
  name          = each.value
  dns_name      = each.value
  contact_email = var.owner_email
}

resource "time_sleep" "wait_for_network_area_membership" {
  count = var.network.sna_enabled ? 1 : 0

  # Allow backend propagation after project label updates before SKE SNA validation.
  create_duration = "30s"

  depends_on = [stackit_resourcemanager_project.this]
}

resource "stackit_routing_table" "sna_egress" {
  count = var.network.sna_enabled && var.network.sna_network_area_id != null && var.network.firewall_next_hop_ip != null ? 1 : 0

  organization_id = var.organization_id
  network_area_id = var.network.sna_network_area_id
  name            = "${var.cluster.name}-sna-egress"
  system_routes   = false

  labels = local.project_labels
}

resource "stackit_routing_table_route" "sna_default_route" {
  count = var.network.sna_enabled && var.network.sna_network_area_id != null && var.network.firewall_next_hop_ip != null ? 1 : 0

  organization_id  = var.organization_id
  network_area_id  = var.network.sna_network_area_id
  routing_table_id = stackit_routing_table.sna_egress[0].routing_table_id

  destination = {
    type  = "cidrv4"
    value = "0.0.0.0/0"
  }

  next_hop = {
    type  = "ipv4"
    value = var.network.firewall_next_hop_ip
  }

  labels = local.project_labels
}

resource "stackit_network" "sna" {
  count = var.network.sna_enabled ? 1 : 0

  project_id         = stackit_resourcemanager_project.this.project_id
  name               = "${var.cluster.name}-sna"
  ipv4_prefix_length = var.network.sna_network_prefix_length
  routed             = true
  routing_table_id   = var.network.firewall_next_hop_ip != null ? stackit_routing_table.sna_egress[0].routing_table_id : null
}