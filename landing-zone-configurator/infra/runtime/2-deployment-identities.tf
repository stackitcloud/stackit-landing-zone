# Org managers provision these broker services; release receives only their space-scoped keys.
resource "cloudfoundry_service_instance" "release" {
  depends_on = [cloudfoundry_space_role.deployer]
  count      = var.production ? 1 : 0

  name                  = "configurator-release"
  space                 = cloudfoundry_space.configurator.id
  type                  = "managed"
  service_offering_name = "space-scoped-service-account"
  service_plan_name     = "space-deployer"
}

resource "cloudfoundry_service_credential_binding" "release" {
  count = var.production ? 1 : 0

  name             = "release"
  service_instance = cloudfoundry_service_instance.release[0].id
  type             = "key"
}

resource "cloudfoundry_service_instance" "dispatcher" {
  depends_on = [cloudfoundry_space_role.runner_developer]
  count      = var.production ? 1 : 0
  provider   = cloudfoundry.runners

  name                  = "configurator-dispatcher"
  space                 = cloudfoundry_space.plan_runners.id
  type                  = "managed"
  service_offering_name = "space-scoped-service-account"
  service_plan_name     = "space-deployer"
}

resource "cloudfoundry_service_credential_binding" "dispatcher" {
  count    = var.production ? 1 : 0
  provider = cloudfoundry.runners

  name             = "dispatcher"
  service_instance = cloudfoundry_service_instance.dispatcher[0].id
  type             = "key"
}

