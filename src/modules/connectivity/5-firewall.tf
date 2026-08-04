###########
## IMAGE ##
###########

locals {
  firewall_image_path = fileexists("${path.root}/firewall-image.qcow2") ? "${path.root}/firewall-image.qcow2" : "/dev/null"
  firewall_enabled    = var.firewall != null
  firewall_ha_enabled = local.firewall_enabled && try(var.firewall.ha, null) != null

  firewall_lan_ip = local.firewall_enabled ? coalesce(var.firewall.lan_ip, cidrhost(var.firewall.lan_network_range, 4)) : null
  firewall_wan_ip = local.firewall_enabled ? coalesce(var.firewall.wan_ip, cidrhost(var.firewall.wan_network_range, 4)) : null

  firewall_backup_lan_ip = local.firewall_ha_enabled ? coalesce(var.firewall.ha.backup_lan_ip, cidrhost(var.firewall.lan_network_range, 5)) : null
  firewall_backup_wan_ip = local.firewall_ha_enabled ? coalesce(var.firewall.ha.backup_wan_ip, cidrhost(var.firewall.wan_network_range, 5)) : null
  firewall_lan_vip       = local.firewall_ha_enabled ? coalesce(var.firewall.ha.lan_vip, cidrhost(var.firewall.lan_network_range, 6)) : null

  firewall_backup_name = local.firewall_ha_enabled ? coalesce(var.firewall.ha.backup_name, "${var.firewall.name}-backup") : null

  firewall_ha_endpoint = local.firewall_ha_enabled ? coalesce(
    var.firewall_admin_endpoint,
    "https://${stackit_public_ip.wan-ip[0].ip}"
  ) : null
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

#################
## BACKUP NODE ##
#################

# Second appliance of the active/passive CARP pair. Deliberately separate resource
# blocks instead of count = 2 on the primary: existing single-node deployments keep
# their state addresses, and enabling HA never touches the primary server.

resource "stackit_volume" "firewall_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  project_id        = stackit_resourcemanager_project.this.project_id
  name              = local.firewall_backup_name
  availability_zone = var.firewall.ha.backup_zone
  size              = var.firewall.volume_size
  performance_class = var.firewall.volume_performance_class
  source = {
    id   = stackit_image.firewall[0].image_id
    type = "image"
  }
}

resource "stackit_server" "firewall_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = local.firewall_backup_name
  boot_volume = {
    source_type = "volume"
    source_id   = stackit_volume.firewall_backup[0].volume_id
  }
  availability_zone = var.firewall.ha.backup_zone
  machine_type      = var.firewall.flavor

  network_interfaces = [
    stackit_network_interface.wan_backup[0].network_interface_id, # vtnet0 = WAN
    stackit_network_interface.lan_backup[0].network_interface_id  # vtnet1 = LAN
  ]
}

#############
## HA CARP ##
#############

# Both nodes are configured by the same apply, so the CARP shared secret never needs an
# operator: it is generated here and only ever travels into the two appliances.
resource "random_password" "carp" {
  count = local.firewall_ha_enabled ? 1 : 0

  length  = 24
  special = false
}

# Node-local HA plumbing: CARP VIP, pfsync and XMLRPC sync settings — exactly the
# settings the XMLRPC sync does not replicate, pushed per node over its public endpoint
# with the admin login (same session technique as the API key bootstrap; the backup has
# no API key, and never needs one: policy reaches it through the XMLRPC sync from the
# primary). Backup first, primary last, so the primary ends up MASTER.
resource "terraform_data" "firewall_ha_backup" {
  count = local.firewall_ha_enabled ? 1 : 0

  triggers_replace = [
    stackit_server.firewall_backup[0].server_id,
    local.firewall_lan_vip,
    var.firewall.ha.vhid,
  ]

  provisioner "local-exec" {
    command     = "bash '${path.module}/scripts/configure-ha.sh' 'https://${stackit_public_ip.wan-ip_backup[0].ip}' backup"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_PASSWORD = var.firewall_admin_password
      OPNSENSE_USERNAME = var.firewall_admin_username
      LAN_VIP_CIDR      = "${local.firewall_lan_vip}/${split("/", var.firewall.lan_network_range)[1]}"
      VHID              = var.firewall.ha.vhid
      CARP_PASSWORD     = random_password.carp[0].result
      PEER_LAN_IP       = local.firewall_lan_ip
    }
  }
}

resource "terraform_data" "firewall_ha_primary" {
  count = local.firewall_ha_enabled ? 1 : 0

  triggers_replace = [
    stackit_server.firewall[0].server_id,
    local.firewall_lan_vip,
    var.firewall.ha.vhid,
  ]

  provisioner "local-exec" {
    command     = "bash '${path.module}/scripts/configure-ha.sh' '${local.firewall_ha_endpoint}' primary"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_PASSWORD = var.firewall_admin_password
      OPNSENSE_USERNAME = var.firewall_admin_username
      LAN_VIP_CIDR      = "${local.firewall_lan_vip}/${split("/", var.firewall.lan_network_range)[1]}"
      VHID              = var.firewall.ha.vhid
      CARP_PASSWORD     = random_password.carp[0].result
      PEER_LAN_IP       = local.firewall_backup_lan_ip
      SYNC_TO_ENDPOINT  = "https://${local.firewall_backup_lan_ip}"
    }
  }

  depends_on = [terraform_data.firewall_ha_backup]
}
