##############
## DNS ZONE ##
##############

resource "stackit_dns_zone" "this" {
  count = var.dns_zone_name != null ? 1 : 0

  project_id  = stackit_resourcemanager_project.this.project_id
  name        = var.dns_zone_name
  dns_name    = var.dns_zone_name
  type        = "primary"
  default_ttl = 3600
}
