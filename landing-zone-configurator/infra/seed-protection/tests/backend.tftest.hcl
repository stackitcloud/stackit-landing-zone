mock_provider "aws" {}

variables {
  region            = "eu01"
  state_bucket_name = "lzc-test-state"
}

run "versioning_is_required" {
  command = plan
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "The remote state bucket must retain object versions."
  }
}
