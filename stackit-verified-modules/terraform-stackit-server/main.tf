locals {
  # Servers that need a module-created NIC
  server_nics = {
    for name, server in var.servers : name => server
    if server.network_interface_ids == null && var.network_id != null
  }

  # Flatten security group rules
  security_group_rules = merge([
    for sg_name, sg in var.security_groups : {
      for idx, rule in sg.rules : "${sg_name}/${idx}" => {
        security_group_name = sg_name
        direction           = rule.direction
        ether_type          = rule.ether_type
      }
    }
  ]...)

  server_volumes = merge([
    for server_key, server in var.servers : {
      for vol_key, vol in server.volumes : "${server_key}/${vol_key}" => {
        server_key        = server_key
        name              = vol_key
        size              = vol.size
        availability_zone = vol.availability_zone != null ? vol.availability_zone : server.availability_zone
        performance_class = vol.performance_class
        source            = vol.source
      }
    }
  ]...)
}

################
## KEY PAIRS ##
################

resource "stackit_key_pair" "this" {
  for_each = var.key_pairs

  name       = each.key
  public_key = each.value.public_key
}

#####################
## SECURITY GROUPS ##
#####################

resource "stackit_security_group" "this" {
  for_each = var.security_groups

  project_id = var.project_id
  name       = each.key
  stateful   = each.value.stateful
}

resource "stackit_security_group_rule" "this" {
  for_each = local.security_group_rules

  project_id        = var.project_id
  security_group_id = stackit_security_group.this[each.value.security_group_name].security_group_id
  direction         = each.value.direction
  ether_type        = each.value.ether_type
}

########################
## NETWORK INTERFACES ##
########################

resource "stackit_network_interface" "this" {
  for_each = local.server_nics

  project_id = var.project_id
  network_id = var.network_id
  security_group_ids = [
    for sg_name in each.value.security_group_names :
    stackit_security_group.this[sg_name].security_group_id
  ]
}

#############
## SERVERS ##
#############

resource "stackit_server" "this" {
  for_each = var.servers

  project_id        = var.project_id
  name              = each.key
  machine_type      = each.value.machine_type
  availability_zone = each.value.availability_zone
  keypair_name      = each.value.keypair_name
  user_data         = each.value.user_data
  labels            = each.value.labels
  affinity_group    = each.value.affinity_group
  desired_status    = each.value.desired_status
  image_id          = each.value.image_id
  region            = each.value.region
  boot_volume       = each.value.boot_volume

  network_interfaces = (
    each.value.network_interface_ids != null
    ? each.value.network_interface_ids
    : var.network_id != null
    ? [stackit_network_interface.this[each.key].network_interface_id]
    : null
  )
}

#############
## VOLUMES ##
#############

resource "stackit_volume" "this" {
  for_each = local.server_volumes

  project_id        = var.project_id
  name              = each.value.name
  size              = each.value.size
  availability_zone = each.value.availability_zone
  performance_class = each.value.performance_class
  source            = each.value.source
}

resource "stackit_server_volume_attach" "this" {
  for_each = local.server_volumes

  project_id = var.project_id
  server_id  = stackit_server.this[each.value.server_key].server_id
  volume_id  = stackit_volume.this[each.key].volume_id
}
