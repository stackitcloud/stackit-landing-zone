###################
## LOGS INSTANCE ##
###################

resource "stackit_logs_instance" "audit" {
  count = var.audit_logs != null ? 1 : 0

  project_id     = stackit_resourcemanager_project.this.project_id
  display_name   = "${var.naming_pattern}-audit"
  retention_days = var.audit_logs.retention_days
  acl            = var.audit_logs.acl
  description    = "Audit log sink for ${var.naming_pattern}"
}

resource "stackit_logs_access_token" "audit_write" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  instance_id  = stackit_logs_instance.audit[0].instance_id
  display_name = "${var.naming_pattern}-audit-write"
  permissions  = ["write"]
  description  = "Bearer token the telemetry router uses to ingest audit logs"
}

resource "stackit_logs_access_token" "audit_read" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  instance_id  = stackit_logs_instance.audit[0].instance_id
  display_name = "${var.naming_pattern}-audit-read"
  permissions  = ["read"]
  description  = "Read token for querying audit logs, e.g. as a Grafana datasource"
}

######################
## TELEMETRY ROUTER ##
######################

resource "stackit_telemetryrouter_instance" "audit" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  display_name = "${var.naming_pattern}-audit"
  description  = "Central ingestion point for STACKIT audit logs"
}

resource "stackit_telemetryrouter_destination" "audit_logs" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  instance_id  = stackit_telemetryrouter_instance.audit[0].instance_id
  display_name = "${var.naming_pattern}-audit-logs"
  description  = "Forwards the audit log stream into the Logs instance"

  config = {
    config_type = "OpenTelemetry"
    opentelemetry = {
      uri          = "https://${stackit_logs_instance.audit[0].ingest_otlp_url}"
      bearer_token = stackit_logs_access_token.audit_write[0].access_token
    }
  }
}

resource "stackit_telemetryrouter_destination" "audit_archive" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  instance_id  = stackit_telemetryrouter_instance.audit[0].instance_id
  display_name = "${var.naming_pattern}-audit-archive"
  description  = "Archives the audit log stream to object storage for long-term retention"

  config = {
    config_type = "S3"
    s3 = {
      bucket   = stackit_objectstorage_bucket.audit_logs.name
      endpoint = trimsuffix(stackit_objectstorage_bucket.audit_logs.url_path_style, "/${stackit_objectstorage_bucket.audit_logs.name}")
      access_key = {
        id     = stackit_objectstorage_credential.this.access_key
        secret = stackit_objectstorage_credential.this.secret_access_key
      }
    }
  }
}

resource "stackit_telemetryrouter_access_token" "audit_link" {
  count = var.audit_logs != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  instance_id  = stackit_telemetryrouter_instance.audit[0].instance_id
  display_name = "${var.naming_pattern}-audit-link"
  description  = "Used by telemetry links to push audit logs into the router"
}

####################
## TELEMETRY LINK ##
####################

locals {
  audit_log_link_scopes = var.audit_logs != null ? coalesce(
    var.audit_logs.link_scopes,
    [{ resource_type = "organization", resource_id = var.organization_id }]
  ) : []
}

# link(org/folder/project) --> telemetry router --+--> OTLP --> logs instance (query)
#                                                 `--> S3   --> audit bucket  (archive)
resource "stackit_telemetrylink" "audit" {
  for_each = { for scope in local.audit_log_link_scopes : "${scope.resource_type}-${scope.resource_id}" => scope }

  resource_type       = each.value.resource_type
  resource_id         = each.value.resource_id
  display_name        = "${var.naming_pattern}-audit"
  description         = "Streams ${each.value.resource_type} audit logs to the platform telemetry router"
  telemetry_router_id = stackit_telemetryrouter_instance.audit[0].instance_id
  access_token        = stackit_telemetryrouter_access_token.audit_link[0].access_token
}

############
## SECRET ##
############

resource "vault_kv_secret_v2" "audit_logs" {
  count = var.audit_logs != null ? 1 : 0

  mount               = stackit_secretsmanager_instance.this.instance_id
  name                = "audit_logs_${replace(var.naming_pattern, "-", "_")}"
  cas                 = 1
  delete_all_versions = true
  data_json = jsonencode(
    {
      # The API returns these without a scheme; store them ready to use.
      INGEST_OTLP_URL = "https://${stackit_logs_instance.audit[0].ingest_otlp_url}"
      QUERY_URL       = "https://${stackit_logs_instance.audit[0].query_url}"
      DATASOURCE_URL  = "https://${stackit_logs_instance.audit[0].datasource_url}"
      WRITE_TOKEN     = stackit_logs_access_token.audit_write[0].access_token
      READ_TOKEN      = stackit_logs_access_token.audit_read[0].access_token
      ROUTER_TOKEN    = stackit_telemetryrouter_access_token.audit_link[0].access_token

      # Credentials for this bucket are the project ones, already in object_storage_credentials_*.
      ARCHIVE_BUCKET   = stackit_objectstorage_bucket.audit_logs.name
      ARCHIVE_ENDPOINT = trimsuffix(stackit_objectstorage_bucket.audit_logs.url_path_style, "/${stackit_objectstorage_bucket.audit_logs.name}")
    }
  )
}
