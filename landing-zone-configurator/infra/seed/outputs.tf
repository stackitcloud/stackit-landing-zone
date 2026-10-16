output "backend" {
  description = "Non-secret backend settings; apply the backend root to enable versioning before platform use."
  value = {
    bucket   = stackit_objectstorage_bucket.state.name
    region   = var.region
    endpoint = "https://object.storage.${var.region}.onstackit.cloud"
  }
}

output "backend_credentials" {
  description = "Operator-only S3 credentials; pass in memory to the backend, never commit or print them."
  sensitive   = true
  value = {
    access_key = stackit_objectstorage_credential.state.access_key
    secret_key = stackit_objectstorage_credential.state.secret_access_key
  }
}
