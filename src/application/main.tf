# Separate entry point for one new Application Landing Zone.
# Only reviewed, server-compiled inputs belong here; this root is not an IAM boundary.
locals {
  target = try(var.platform_contract.targets[var.application.target_key], null)
}

resource "terraform_data" "contract" {
  input = var.application.instance_id
  lifecycle {
    precondition {
      condition     = var.platform_contract.tenant_id == var.application.tenant_id && var.platform_contract.revision == var.application.platform_revision
      error_message = "Application and platform must belong to the same tenant and contract revision."
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
  naming_pattern         = "app-${var.application.instance_id}"
  project_name           = var.application.name
  owner_email            = var.application.owner_email
  custom_roles           = []
  role_assignments       = []
  corporate              = try(local.target.corporate, false)
  network_area_id        = try(local.target.network_area_id, null)
  firewall_next_hop_ip   = try(local.target.firewall_next_hop_ip, null)
  ipv4_nameservers       = try(local.target.ipv4_nameservers, null)
  secretsmanager_enabled = var.application.secretsmanager_enabled
  observability          = var.application.observability
  labels = {
    managed_by   = "landing-zone-configurator"
    lzc_instance = var.application.instance_id
    lzc_template = var.application.template_id
  }
  depends_on = [terraform_data.contract]
}

output "application_resources" {
  description = "Non-secret resource references; never publish service credentials or complete state."
  value = {
    instance_id                = var.application.instance_id
    project_id                 = module.application.project_id
    project_container_id       = module.application.project_container_id
    secretsmanager_instance_id = module.application.secretsmanager_instance_id
    observability_instance_id  = module.application.observability_instance_id
  }
}
