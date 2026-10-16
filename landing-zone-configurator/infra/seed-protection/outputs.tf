output "versioning_enabled" {
  description = "Successful IaC application of bucket versioning; not a substitute for a restore test."
  value       = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
}

output "state_bucket_name" {
  description = "Bucket that was protected, checked against the platform backend."
  value       = aws_s3_bucket_versioning.state.bucket
}
