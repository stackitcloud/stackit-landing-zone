#####################
## PFSENSE - IMAGE ##
#####################

# resource "terraform_data" "pfsense_image_file" {
#   triggers_replace = [
#     timestamp()
#   ]

#   provisioner "local-exec" {
#     command = "curl -o pfsense.qcow2 https://pfsense.object.storage.eu01.onstackit.cloud/pfsense-ce-2.7.2-amd64-10-12-2024.qcow2"
#   }
# }

resource "stackit_image" "pfsense_image" {
  project_id      = stackit_resourcemanager_project.this.project_id
  name            = "pfsense-2.7.2-amd64-image"
  local_file_path = "./pfsense.qcow2"
  disk_format     = "qcow2"
  min_disk_size   = 10
  min_ram         = 2
  config = {
    uefi = false
  }

  # depends_on      = [terraform_data.pfsense_image_file]
}

############
## VOLUME ##
############

resource "stackit_volume" "pfsense_vol" {
  project_id        = stackit_resourcemanager_project.this.project_id
  name              = "pfsense-2.7.2-root"
  availability_zone = var.firewall_zone
  size              = 16
  performance_class = "storage_premium_perf4"
  source = {
    id   = stackit_image.pfsense_image.image_id
    type = "image"
  }
}

############
## SERVER ##
############

# after rollout: https://docs.stackit.cloud/products/quick-deployments/pfsense-firewall/tutorials/configure-pfsense/
resource "stackit_server" "pfsense_Server" {
  project_id = stackit_resourcemanager_project.this.project_id
  name       = "pfSense"
  boot_volume = {
    source_type = "volume"
    source_id   = stackit_volume.pfsense_vol.volume_id
  }
  availability_zone = var.firewall_zone
  machine_type      = var.firewall_flavor
  
  network_interfaces = [
    stackit_network_interface.wan.network_interface_id, # vtnet0 = WAN
    stackit_network_interface.lan.network_interface_id  # vtnet1 = LAN
  ]
}