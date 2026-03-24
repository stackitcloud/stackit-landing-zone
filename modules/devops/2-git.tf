##################
## GIT INSTANCE ##
##################

resource "stackit_git" "git" {
  count = var.git_flavor != null ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = replace(lower(substr(var.company_name, 0, 31)), " ", "-")
  acl        = var.allowed_network_ranges
  flavor     = var.git_flavor
}