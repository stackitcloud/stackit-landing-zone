# terraform {
#   backend "s3" {
#     bucket = "<BUCKET_NAME>"
#     endpoints = {
#       s3 = "https://object.storage.eu01.onstackit.cloud"
#     }
#     key                         = "terraform.tfstate"
#     region                      = "eu01"
#     skip_credentials_validation = true
#     skip_region_validation      = true
#     skip_requesting_account_id  = true
#     skip_s3_checksum            = true
#   }
# }
