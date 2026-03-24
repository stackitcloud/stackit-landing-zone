output "projects" {
  description = "The created STACKIT projects with their IDs, container IDs, and names."
  value = {
    for k, v in stackit_resourcemanager_project.this : k => {
      project_id   = v.project_id
      container_id = v.container_id
      name         = v.name
    }
  }
}
