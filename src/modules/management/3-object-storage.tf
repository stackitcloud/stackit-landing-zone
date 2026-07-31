####################
## OBJECT STORAGE ##
####################

resource "stackit_objectstorage_compliance_lock" "this" {
  count = try(var.audit_logs.s3_object_lock, false) ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
}

#############
## BUCKETS ##
#############

resource "stackit_objectstorage_bucket" "default" {
  name       = "${var.naming_pattern}-default"
  project_id = stackit_resourcemanager_project.this.project_id
}

resource "stackit_objectstorage_bucket" "tfstate" {
  name       = "${var.naming_pattern}-tfstate"
  project_id = stackit_resourcemanager_project.this.project_id

  depends_on = [
    stackit_objectstorage_bucket.default, # "project.create_conflict","msg":"Two concurrent calls try to create the same project"}]}
  ]
}

resource "stackit_objectstorage_bucket" "audit_logs" {
  name       = "${var.naming_pattern}-audit-logs"
  project_id = stackit_resourcemanager_project.this.project_id

  object_lock = local.audit_object_lock ? true : null

  depends_on = [
    stackit_objectstorage_bucket.tfstate,       # "project.create_conflict","msg":"Two concurrent calls try to create the same project"}]}
    stackit_objectstorage_compliance_lock.this, # object_lock requires the project lock to exist first
  ]
}

resource "stackit_objectstorage_default_retention" "audit_logs" {
  count = local.audit_object_lock ? 1 : 0

  project_id  = stackit_resourcemanager_project.this.project_id
  bucket_name = stackit_objectstorage_bucket.audit_logs.name
  days        = var.audit_logs.retention_days

  # GOVERNANCE, not COMPLIANCE: objects can still be removed early by a holder of s3:BypassGovernanceRetention, which keeps the bucket and project destroyable.
  mode = "GOVERNANCE"
}

#################
## CREDENTIALS ##
#################

resource "stackit_objectstorage_credentials_group" "this" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = var.naming_pattern

  depends_on = [
    stackit_objectstorage_bucket.default,
    stackit_objectstorage_bucket.tfstate,
    stackit_objectstorage_bucket.audit_logs
  ]
}

resource "stackit_objectstorage_credential" "this" {
  project_id           = stackit_resourcemanager_project.this.project_id
  credentials_group_id = stackit_objectstorage_credentials_group.this.credentials_group_id
}

resource "vault_kv_secret_v2" "object_storage_credentials" {
  mount               = stackit_secretsmanager_instance.this.instance_id
  name                = "object_storage_credentials_${replace(var.naming_pattern, "-", "_")}"
  cas                 = 1
  delete_all_versions = true
  data_json = jsonencode(
    {
      ACCESS_KEY        = stackit_objectstorage_credential.this.access_key,
      SECRET_ACCESS_KEY = stackit_objectstorage_credential.this.secret_access_key
    }
  )
}