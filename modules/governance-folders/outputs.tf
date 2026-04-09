output "folder_container_ids" {
  description = "Map of older IDs for easy reference"
  value = {
    root         = var.organization_id
    container_id = stackit_resourcemanager_folder.this.container_id
    folder_id    = stackit_resourcemanager_folder.this.folder_id
  }
}
