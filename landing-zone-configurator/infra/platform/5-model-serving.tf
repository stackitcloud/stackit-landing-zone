resource "stackit_modelserving_token" "configurator" {
  project_id   = var.project_id
  name         = "${var.name_prefix}-chat"
  description  = "Landing Zone Configurator backend inference access"
  ttl_duration = "2160h"
  rotate_when_changed = {
    generation = var.credential_generation
  }
}
