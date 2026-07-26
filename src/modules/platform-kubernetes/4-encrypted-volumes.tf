data "stackit_service_accounts" "ske_internal" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  email_suffix = "@ske.sa.stackit.cloud"

  depends_on = [stackit_ske_cluster.this]
}

resource "stackit_kms_keyring" "this" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  display_name = "${var.naming_pattern}-${var.encrypted_volumes.kms_keyring_name}"
}

resource "stackit_kms_key" "this" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  keyring_id   = stackit_kms_keyring.this[0].keyring_id
  display_name = "${var.naming_pattern}-${var.encrypted_volumes.kms_key_name}"
  protection   = "software"
  algorithm    = "aes_256_gcm"
  purpose      = "symmetric_encrypt_decrypt"
}

resource "stackit_service_account" "kms_manager" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  # STACKIT service account names are limited to 20 characters.
  name = "${substr(var.naming_pattern, 0, 8)}-kms-mgr"
}

resource "stackit_authorization_project_role_assignment" "kms_admin" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  resource_id = stackit_resourcemanager_project.this.project_id
  role        = "kms.admin"
  subject     = stackit_service_account.kms_manager[0].email
}

resource "stackit_authorization_service_account_role_assignment" "ske_impersonation" {
  count = var.encrypted_volumes.enabled ? 1 : 0

  resource_id = stackit_service_account.kms_manager[0].service_account_id
  role        = "user"
  subject     = data.stackit_service_accounts.ske_internal[0].items[0].email
}
