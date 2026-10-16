mock_provider "stackit" {
  mock_resource "stackit_objectstorage_credentials_group" {
    defaults = {
      credentials_group_id = "00000000-0000-4000-8000-000000000010"
    }
  }
}

variables {
  project_id                  = "00000000-0000-4000-8000-000000000001"
  region                      = "eu01"
  name_prefix                 = "lzc-test"
  state_credential_expiration = "2027-01-01T00:00:00Z"
}

run "backend_credential_lifetime" {
  command = plan

  assert {
    condition     = stackit_objectstorage_credential.state.expiration_timestamp == "2027-01-01T00:00:00Z"
    error_message = "Backend credentials must have an explicit expiry."
  }
}

run "reject_unsupported_region" {
  command = plan
  variables {
    region = "unsupported"
  }
  expect_failures = [var.region]
}
