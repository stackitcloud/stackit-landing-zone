###########
## IMAGE ##
###########

locals {
  firewall_image_path = "${path.root}/firewall-image.qcow2"
  firewalls = var.firewalls != null ? var.firewalls : var.firewall != null ? {
    for key, area in var.network_areas : key => var.firewall
  } : {}
  ha_firewalls = { for key, firewall in local.firewalls : key => firewall if firewall.ha != null }

  firewall_lan_ips = {
    for key, firewall in local.firewalls : key => coalesce(firewall.lan_ip, cidrhost(firewall.lan_network_range, 4))
  }
  firewall_wan_ips = {
    for key, firewall in local.firewalls : key => coalesce(firewall.wan_ip, cidrhost(firewall.wan_network_range, 4))
  }
  firewall_backup_lan_ips = {
    for key, firewall in local.ha_firewalls : key => coalesce(firewall.ha.backup_lan_ip, cidrhost(firewall.lan_network_range, 5))
  }
  firewall_backup_wan_ips = {
    for key, firewall in local.ha_firewalls : key => coalesce(firewall.ha.backup_wan_ip, cidrhost(firewall.wan_network_range, 5))
  }
  firewall_lan_vips = {
    for key, firewall in local.ha_firewalls : key => coalesce(firewall.ha.lan_vip, cidrhost(firewall.lan_network_range, 6))
  }
  firewall_backup_names = {
    for key, firewall in local.ha_firewalls : key => coalesce(firewall.ha.backup_name, "${firewall.name}-backup")
  }

  # Resource references needed for one firewall deployment per network area.
  network_area_firewall = { for key, firewall in local.firewalls : key => {
    project_id    = stackit_resourcemanager_project.this[key].project_id
    wan_ip        = try(stackit_public_ip.wan-ip[key].ip, null)
    wan_backup_ip = try(stackit_public_ip.wan-ip_backup[key].ip, null)
    lan_ip        = local.firewall_lan_ips[key]
    lan_backup_ip = try(local.firewall_backup_lan_ips[key], null)
    lan_vip       = try(local.firewall_lan_vips[key], null)
  } }
}

resource "stackit_image" "firewall" {
  for_each = local.firewalls

  project_id      = local.network_area_firewall[each.key].project_id
  name            = each.value.name
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
  for_each = local.firewalls

  project_id        = local.network_area_firewall[each.key].project_id
  name              = each.value.name
  availability_zone = each.value.zone
  size              = each.value.volume_size
  performance_class = each.value.volume_performance_class
  source = {
    id   = stackit_image.firewall[each.key].image_id
    type = "image"
  }
}

############
## SERVER ##
############

resource "stackit_server" "firewall" {
  for_each = local.firewalls

  project_id = local.network_area_firewall[each.key].project_id
  name       = each.value.name
  boot_volume = {
    source_type = "volume"
    source_id   = stackit_volume.firewall[each.key].volume_id
  }
  availability_zone = each.value.zone
  machine_type      = each.value.flavor

  network_interfaces = [
    stackit_network_interface.wan[each.key].network_interface_id, # vtnet0 = WAN
    stackit_network_interface.lan[each.key].network_interface_id  # vtnet1 = LAN
  ]
}

#################
## BACKUP NODE ##
#################

# Second appliance of the active/passive CARP pair. Deliberately separate resource
# blocks instead of count = 2 on the primary: existing single-node deployments keep
# their state addresses, and enabling HA never touches the primary server.

resource "stackit_volume" "firewall_backup" {
  for_each = local.ha_firewalls

  project_id        = local.network_area_firewall[each.key].project_id
  name              = local.firewall_backup_names[each.key]
  availability_zone = each.value.ha.backup_zone
  size              = each.value.volume_size
  performance_class = each.value.volume_performance_class
  source = {
    id   = stackit_image.firewall[each.key].image_id
    type = "image"
  }
}

resource "stackit_server" "firewall_backup" {
  for_each = local.ha_firewalls

  project_id = local.network_area_firewall[each.key].project_id
  name       = local.firewall_backup_names[each.key]
  boot_volume = {
    source_type = "volume"
    source_id   = stackit_volume.firewall_backup[each.key].volume_id
  }
  availability_zone = each.value.ha.backup_zone
  machine_type      = each.value.flavor

  network_interfaces = [
    stackit_network_interface.wan_backup[each.key].network_interface_id, # vtnet0 = WAN
    stackit_network_interface.lan_backup[each.key].network_interface_id  # vtnet1 = LAN
  ]
}

#############
## HA CARP ##
#############

# Both nodes are configured by the same apply, so the CARP shared secret never needs an
# operator: it is generated here and only ever travels into the two appliances.
resource "random_password" "carp" {
  for_each = local.ha_firewalls

  length  = 24
  special = false
}

# Node-local HA plumbing: CARP VIP, pfsync and XMLRPC sync settings — exactly the
# settings the XMLRPC sync does not replicate, pushed per node over its public endpoint
# with the admin login (same session technique as the API key bootstrap; the backup has
# no API key, and never needs one: policy reaches it through the XMLRPC sync from the
# primary). Backup first, primary last, so the primary ends up MASTER.
resource "terraform_data" "firewall_ha_backup" {
  for_each = local.ha_firewalls

  triggers_replace = [
    stackit_server.firewall_backup[each.key].server_id,
    local.firewall_lan_vips[each.key],
    each.value.ha.vhid,
  ]

  provisioner "local-exec" {
    command     = "bash '${path.module}/scripts/configure-ha.sh' 'https://${local.network_area_firewall[each.key].wan_backup_ip}' backup"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_PASSWORD = var.firewall_admin_password
      OPNSENSE_USERNAME = var.firewall_admin_username
      LAN_VIP_CIDR      = "${local.firewall_lan_vips[each.key]}/${split("/", each.value.lan_network_range)[1]}"
      VHID              = each.value.ha.vhid
      CARP_PASSWORD     = random_password.carp[each.key].result
      PEER_LAN_IP       = local.firewall_lan_ips[each.key]
    }
  }
}

resource "terraform_data" "firewall_ha_primary" {
  for_each = local.ha_firewalls

  triggers_replace = [
    stackit_server.firewall[each.key].server_id,
    local.firewall_lan_vips[each.key],
    each.value.ha.vhid,
  ]

  provisioner "local-exec" {
    command     = "bash '${path.module}/scripts/configure-ha.sh' 'https://${local.network_area_firewall[each.key].wan_ip}' primary"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_PASSWORD = var.firewall_admin_password
      OPNSENSE_USERNAME = var.firewall_admin_username
      LAN_VIP_CIDR      = "${local.firewall_lan_vips[each.key]}/${split("/", each.value.lan_network_range)[1]}"
      VHID              = each.value.ha.vhid
      CARP_PASSWORD     = random_password.carp[each.key].result
      PEER_LAN_IP       = local.firewall_backup_lan_ips[each.key]
      SYNC_TO_ENDPOINT  = "https://${local.network_area_firewall[each.key].lan_backup_ip}"
    }
  }

  depends_on = [terraform_data.firewall_ha_backup]
}
