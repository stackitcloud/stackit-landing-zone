terraform {
  backend "s3" {
    bucket = "lza-terraform-state"
    endpoints = {
      s3 = "https://object.storage.eu01.onstackit.cloud"
    }
    key                         = "landing-zone/terraform.tfstate"
    region                      = "eu01"
    use_path_style              = true
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
