locals {
  audit_managed_enabled = try(var.audit_logs.managed_resources, false)
  # Keys come from configuration, not computed project UUIDs, so the first Plan
  # can create projects and their links without a targeted bootstrap Apply.
  audit_managed_projects = merge(
    { management = module.management.project_id },
    { for key, id in try(module.connectivity[0].project_id, {}) : "connectivity-${key}" => id },
    { for key, id in try(module.connectivity_eu01[0].project_id, {}) : "connectivity-eu01-${key}" => id },
    { for key, id in try(module.connectivity_eu02[0].project_id, {}) : "connectivity-eu02-${key}" => id },
    { for key, m in module.devops : "devops-${key}" => m.project_id },
    { for key, m in module.platform_kubernetes : "kubernetes-${key}" => m.project_id },
    { for key, m in module.platform_kubernetes_eu01 : "kubernetes-eu01-${key}" => m.project_id },
    { for key, m in module.platform_kubernetes_eu02 : "kubernetes-eu02-${key}" => m.project_id },
    { for key, p in try(module.sandboxes[0].projects, {}) : "sandbox-${key}" => p.project_id },
    { for key, m in module.landing_zone : "application-${key}" => m.project_id },
    { for key, m in module.landing_zone_eu01 : "application-eu01-${key}" => m.project_id },
    { for key, m in module.landing_zone_eu02 : "application-eu02-${key}" => m.project_id },
  )
  audit_managed_scopes = merge(
    { for key, id in local.audit_managed_projects : "project-${key}" => { resource_type = "project", resource_id = id } },
    { for key, id in module.governance.folder_container_ids : "folder-${key}" => { resource_type = "folder", resource_id = id } if key != "root" },
  )
  audit_managed_regions = concat(
    var.connectivity_regions == null ? [] : keys(var.connectivity_regions),
    [for cluster in values(var.platform_kubernetes) : cluster.region],
    [for project in values(var.landing_zones) : coalesce(project.region, var.region)],
  )
}

resource "stackit_telemetrylink" "managed_audit" {
  for_each = local.audit_managed_enabled ? local.audit_managed_scopes : {}

  resource_type       = each.value.resource_type
  resource_id         = each.value.resource_id
  region              = var.region
  display_name        = "${var.company_code}-managed-audit"
  description         = "Central audit routing for managed ${each.value.resource_type}"
  telemetry_router_id = module.management.audit_telemetry_router_id
  access_token        = module.management.audit_telemetry_router_token

  lifecycle {
    precondition {
      condition     = alltrue([for region in local.audit_managed_regions : region == var.region])
      error_message = "Automatic audit coverage currently requires all managed resources in the platform region. A separate regional router and reviewed handoff are required for other regions."
    }
  }
}
