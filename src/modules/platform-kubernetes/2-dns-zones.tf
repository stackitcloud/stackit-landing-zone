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
