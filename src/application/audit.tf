resource "stackit_telemetryrouter_access_token" "audit" {
  count = try(local.target.audit_router, null) != null ? 1 : 0

  project_id   = local.target.audit_router.project_id
  instance_id  = local.target.audit_router.instance_id
  region       = local.target.region
  display_name = replace(var.application.instance_id, "-", "")
  description  = "Ingestion for Application ${var.application.instance_id}"

  depends_on = [module.application]
}

resource "stackit_telemetrylink" "audit" {
  count = try(local.target.audit_router, null) != null ? 1 : 0

  resource_type       = "project"
  resource_id         = module.application.project_id
  region              = local.target.region
  display_name        = replace(var.application.instance_id, "-", "")
  description         = "Central audit routing for Application ${var.application.instance_id}"
  telemetry_router_id = local.target.audit_router.instance_id
  access_token        = stackit_telemetryrouter_access_token.audit[0].access_token
}
