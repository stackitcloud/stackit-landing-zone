#####################
## SERVICE ACCOUNT ##
#####################

resource "stackit_service_account" "automation" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = substr(replace("${var.naming_pattern}-automation", "-", ""), 0, 20)
}

resource "time_rotating" "key_rotate" {
  rotation_days = 60
}

resource "stackit_service_account_key" "automation" {
  project_id            = stackit_resourcemanager_project.this.project_id
  service_account_email = stackit_service_account.automation.email
  ttl_days              = 90

  rotate_when_changed = {
    rotation = time_rotating.key_rotate.id
  }
}

resource "stackit_authorization_organization_role_assignment" "sa_owner" {
  resource_id = var.organization_id
  role        = "owner"
  subject     = stackit_service_account.automation.email
}

resource "vault_kv_secret_v2" "service_account_key_automation" {
  mount               = stackit_secretsmanager_instance.this.instance_id
  name                = "service_account_key_${replace(var.naming_pattern, "-", "_")}"
  cas                 = 1
  delete_all_versions = true
  data_json           = stackit_service_account_key.automation.json
}

##############################
## FEDERATED IDENTITY PROVIDER
##############################

resource "stackit_service_account_federated_identity_provider" "this" {
  for_each = { for idx, fip in var.federated_identity_providers : fip.name => fip }

  project_id            = stackit_resourcemanager_project.this.project_id
  service_account_email = stackit_service_account.automation.email
  name                  = each.value.name
  issuer                = each.value.issuer

  assertions = each.value.assertions
}