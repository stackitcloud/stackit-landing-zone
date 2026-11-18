##################
## PROJECT GIT  ##
##################

resource "stackit_git" "this" {
  count = var.git.enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = replace(lower(substr(var.naming_pattern, 0, 31)), " ", "-")
  flavor     = var.git.flavor
  acl        = var.git.acl
}
