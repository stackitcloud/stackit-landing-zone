resource "stackit_dns_zone" "application" {
  count = var.production ? 1 : 0

  project_id    = var.project_id
  name          = "landing-zone"
  dns_name      = var.dns_zone
  contact_email = var.dns_contact_email
  type          = "primary"
  default_ttl   = 300

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.dns_zone == "landing-zone.runs.onstackit.cloud" && var.public_domain == "app.landing-zone.runs.onstackit.cloud" && var.dns_contact_email != null
      error_message = "Production needs the reviewed DNS zone, exact application domain and operator contact."
    }
  }
}

resource "stackit_dns_record_set" "application" {
  count = var.production ? 1 : 0

  project_id = var.project_id
  zone_id    = stackit_dns_zone.application[0].zone_id
  name       = "${var.public_domain}."
  type       = "CNAME"
  records    = ["console.apps.01.cf.eu01.stackit.cloud."]
  ttl        = 300
}

resource "cloudfoundry_domain" "application" {
  count = var.production ? 1 : 0

  name     = var.public_domain
  org      = var.cf_org_id
  internal = false

  lifecycle {
    prevent_destroy = true
  }
}

