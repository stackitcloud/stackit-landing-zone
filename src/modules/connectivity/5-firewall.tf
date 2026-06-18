###########
## IMAGE ##
###########

locals {
  firewall_image_path = fileexists("${path.root}/firewall-image.qcow2") ? "${path.root}/firewall-image.qcow2" : "/dev/null"
  firewall_enabled    = var.firewall != null
}

resource "stackit_image" "firewall" {
  count = local.firewall_enabled ? 1 : 0

  project_id      = stackit_resourcemanager_project.this.project_id
  name            = var.firewall.name
  local_file_path = local.firewall_image_path
  disk_format     = "qcow2"
  min_disk_size   = 16
  min_ram         = 2
  config = {
    uefi = false
  }
}

############
## VOLUME ##
############

resource "stackit_volume" "firewall" {
  count = local.firewall_enabled ? 1 : 0

  project_id        = stackit_resourcemanager_project.this.project_id
  name              = var.firewall.name
  availability_zone = var.firewall.zone
  size              = var.firewall.volume_size
  performance_class = var.firewall.volume_performance_class
  source = {
    id   = stackit_image.firewall[0].image_id
    type = "image"
  }
}

############
## SERVER ##
############

resource "stackit_server" "firewall" {
  count = local.firewall_enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = var.firewall.name
  boot_volume = {
    source_type = "volume"
    source_id   = stackit_volume.firewall[0].volume_id
  }
  availability_zone = var.firewall.zone
  machine_type      = var.firewall.flavor

  network_interfaces = [
    stackit_network_interface.wan[0].network_interface_id, # vtnet0 = WAN
    stackit_network_interface.lan[0].network_interface_id  # vtnet1 = LAN
  ]
}