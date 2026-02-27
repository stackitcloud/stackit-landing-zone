#############
## PROJECT ##
#############

resource "stackit_resourcemanager_project" "project" {
  for_each = { for sandbox in var.sandboxes : sandbox.project_name => sandbox }

  parent_container_id = var.parent_container_id
  name                = each.value.project_name
  owner_email         = each.value.project_owner_email

  lifecycle {
    ignore_changes = [labels] # provider bug
  }
}

resource "stackit_authorization_project_role_assignment" "assignments" {
  for_each = {
    for assignment in flatten([
      for sandbox in var.sandboxes : [
        for email in coalesce(sandbox.owner_emails, []) : {
          key          = "${sandbox.project_name}-${email}"
          project_name = sandbox.project_name
          email        = email
        }
      ]
    ]) : assignment.key => assignment
  }

  resource_id = stackit_resourcemanager_project.project[each.value.project_name].project_id
  role        = "owner"
  subject     = each.value.email
}