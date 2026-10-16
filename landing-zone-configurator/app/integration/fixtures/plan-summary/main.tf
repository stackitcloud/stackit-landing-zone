terraform {
  required_version = "= 1.12.6"
}

# Built-in provider: no cloud, credentials or provider download required.
resource "terraform_data" "example" {
  input = "private-spike-value"
}

output "private_output" {
  value     = terraform_data.example.input
  sensitive = true
}
