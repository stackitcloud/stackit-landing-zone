##############################
## RESOURCE MANAGER FOLDERS ##
##############################

###########
# Level 1 #
###########

resource "stackit_resourcemanager_folder" "platform" {
  name                = "Platform"
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = local.labels
}

resource "stackit_resourcemanager_folder" "landing_zones_corporate" {
  name                = "Landing Zones - Corporate"
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = local.labels
}

resource "stackit_resourcemanager_folder" "landing_zones_public" {
  name                = "Landing Zones - Public"
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = local.labels
}

resource "stackit_resourcemanager_folder" "sandbox" {
  name                = "Sandboxes"
  parent_container_id = var.organization_id
  owner_email         = var.owner_email
  labels              = local.labels
} 