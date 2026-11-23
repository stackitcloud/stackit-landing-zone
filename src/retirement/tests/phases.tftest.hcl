mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_folder" {
    defaults = {
      folder_id    = "11111111-1111-4111-8111-111111111111"
      container_id = "22222222-2222-4222-8222-222222222222"
    }
  }
}

variables {
  organization_id = "00000000-0000-4000-8000-000000000001"
  owner_email     = "owner@example.com"
  rm_folders = {
    platform = {
      name = "Disposable retirement test"
    }
  }
  retirement_phase = "remove_projects"
}

run "retain_original_folders" {
  command = apply

  assert {
    condition     = output.retained_folder_ids["platform"] == "11111111-1111-4111-8111-111111111111"
    error_message = "Project removal must retain the captured folder identity."
  }
}

run "keep_identity_on_repeated_phase" {
  command = plan

  assert {
    condition     = output.retained_folder_ids["platform"] == "11111111-1111-4111-8111-111111111111"
    error_message = "Repeating project removal must retain the original folder address and UUID."
  }
}

run "finalize_folders" {
  command = apply

  variables {
    retirement_phase = "finalize_folders"
  }

  assert {
    condition     = length(output.retained_folder_ids) == 0
    error_message = "Finalization must remove folders from this same State."
  }
}

run "reject_unknown_phase" {
  command = plan

  variables {
    retirement_phase = "active"
  }

  expect_failures = [var.retirement_phase]
}
