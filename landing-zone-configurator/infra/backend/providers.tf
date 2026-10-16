# Receives already-created STACKIT S3 credentials via the operator process environment.
provider "aws" {
  access_key                  = var.storage_access_key
  secret_key                  = var.storage_secret_key
  region                      = var.region
  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    s3 = "https://object.storage.${var.region}.onstackit.cloud"
  }
}
