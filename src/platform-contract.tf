locals {
  platform_contract_networks = var.connectivity_regions == null ? {
    (var.region) = {
      for area, id in try(module.connectivity[0].network_area_id, {}) : area => {
        network_area_id      = id
        firewall_next_hop_ip = try(module.connectivity[0].firewall_next_hop_ip[area], null)
        ipv4_nameservers     = try(module.connectivity[0].network_area_nameservers[area], null)
      }
    }
    } : {
    eu01 = {
      for area, id in try(module.connectivity_eu01[0].network_area_id, {}) : area => {
        network_area_id      = id
        firewall_next_hop_ip = try(module.connectivity_eu01[0].firewall_next_hop_ip[area], null)
        ipv4_nameservers     = try(module.connectivity_eu01[0].network_area_nameservers[area], null)
      }
    }
    eu02 = {
      for area, id in try(module.connectivity_eu02[0].network_area_id, {}) : area => {
        network_area_id      = id
        firewall_next_hop_ip = try(module.connectivity_eu02[0].firewall_next_hop_ip[area], null)
        ipv4_nameservers     = try(module.connectivity_eu02[0].network_area_nameservers[area], null)
      }
    }
  }
  platform_contract_targets = merge(
    {
      for region in ["eu01", "eu02"] : "public-${region}" => merge({
        folder_id            = module.governance.folder_container_ids["landing_zones_public"]
        region               = region
        corporate            = false
        network_area_id      = null
        firewall_next_hop_ip = null
        ipv4_nameservers     = null
        }, local.audit_managed_enabled ? {
        audit_router = { project_id = module.management.project_id, instance_id = module.management.audit_telemetry_router_id }
      } : {}) if contains(keys(module.governance.folder_container_ids), "landing_zones_public") && (!local.audit_managed_enabled || region == var.region)
    },
    merge([for region, areas in local.platform_contract_networks : {
      for area, network in areas : "corporate-${region}-${substr(sha256(area), 0, 16)}" => merge(network, {
        folder_id = module.governance.folder_container_ids["landing_zones_corporate"]
        region    = region
        corporate = true
        }, local.audit_managed_enabled ? {
        audit_router = { project_id = module.management.project_id, instance_id = module.management.audit_telemetry_router_id }
      } : {}) if contains(keys(module.governance.folder_container_ids), "landing_zones_corporate")
    }]...)
  )
}