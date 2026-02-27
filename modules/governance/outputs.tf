output "folder_container_ids" {
  description = "Map of all folder names to their container IDs for easy reference"
  value = {
    root                    = var.organization_id
    platform                = stackit_resourcemanager_folder.platform.container_id
    landing_zones_public    = stackit_resourcemanager_folder.landing_zones_public.container_id
    landing_zones_corporate = stackit_resourcemanager_folder.landing_zones_corporate.container_id
    sandbox                 = stackit_resourcemanager_folder.sandbox.container_id
  }
}