# STACKIT supports S3 bucket versioning but exposes no dedicated resource in the pinned provider.
resource "aws_s3_bucket_versioning" "state" {
  bucket = var.state_bucket_name
  versioning_configuration {
    status = "Enabled"
  }
  lifecycle {
    prevent_destroy = true
  }
}
