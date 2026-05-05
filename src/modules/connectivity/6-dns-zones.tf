###############
## DNS ZONES ##
###############

resource "stackit_dns_zone" "this" {
  for_each = var.dns_zones

  project_id    = stackit_resourcemanager_project.this.project_id
  name          = each.value.name != null ? each.value.name : each.value.dns_name
  dns_name      = each.value.dns_name
  contact_email = each.value.contact_email
  type          = each.value.type
  acl           = each.value.acl
  description   = each.value.description
  default_ttl   = each.value.default_ttl
}