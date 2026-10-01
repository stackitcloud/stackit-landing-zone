# Separate entry point for one new Application Landing Zone.
# Only reviewed, server-compiled inputs belong here; this root is not an IAM boundary.
locals {
  target = try(var.platform_contract.targets[var.application.target_key], null)
  # An omitted stage preserves existing resource names exactly. New instances may
  # include a validated stage; this is not an update/rename contract for deployed instances.
  naming_pattern = var.application.env == null ? "app-${var.application.instance_id}" : "app-${var.application.instance_id}-${var.application.env}"
  application_labels = merge({
    managed_by   = "landing-zone-configurator"
    lzc_instance = var.application.instance_id
    lzc_template = var.application.template_id
  }, var.application.env == null ? {} : { env = var.application.env })
}

resource "terraform_data" "contract" {
  input = var.application.instance_id
  lifecycle {
    precondition {
      condition     = var.platform_contract.tenant_id == var.application.tenant_id && var.platform_contract.revision == var.application.platform_revision
      error_message = "Application and platform must belong to the same tenant and contract revision."
    }
    # Observability ACL filters Internet source addresses. A private routed
    # network CIDR is not proven to survive NAT/egress as that source. Do not
    # forward a symbolic binding as [] (which means unrestricted access).
    precondition {
      condition     = var.application.observability.access_source != "project-network"
      error_message = "Observability project-network binding is not executable: qualify the effective egress source/NAT path first. No empty or allow-all ACL fallback is permitted."
    }
    precondition {
      condition     = local.target != null
      error_message = "The application target must exist in the published platform contract."
    }
  }
}

module "application" {
  source = "../modules/landing-zone"

  organization_id        = var.platform_contract.organization_id
  parent_container_id    = try(local.target.folder_id, "")
  naming_pattern         = local.naming_pattern
  project_name           = var.application.name
  owner_email            = var.application.owner_email
  custom_roles           = var.application.custom_roles
  role_assignments       = var.application.role_assignments
  corporate              = try(local.target.corporate, false)
  network_area_id        = try(local.target.network_area_id, null)
  firewall_next_hop_ip   = try(local.target.firewall_next_hop_ip, null)
  ipv4_nameservers       = try(local.target.ipv4_nameservers, null)
  secretsmanager_enabled = var.application.secretsmanager_enabled
  observability          = var.application.observability
  labels                 = local.application_labels

  depends_on = [terraform_data.contract]
}

output "application_resources" {
  description = "Non-secret resource references; never publish service credentials or complete state."
  value = {
    instance_id                = var.application.instance_id
    env                        = var.application.env
    naming_pattern             = local.naming_pattern
    project_id                 = module.application.project_id
    project_container_id       = module.application.project_container_id
    secretsmanager_instance_id = module.application.secretsmanager_instance_id
    observability_instance_id  = module.application.observability_instance_id
  }
}
