locals {
  debug_bastion_enabled      = var.debug_bastion.enabled && var.network.sna_enabled
  debug_bastion_short_prefix = trim(replace(substr(var.naming_pattern, 0, 14), "/-{2,}/", "-"), "-")
  debug_bastion_name         = var.debug_bastion.name != null ? var.debug_bastion.name : "${var.naming_pattern}-dbg"
}

module "debug_bastion" {
  source = "../debug-bastion"
  count  = local.debug_bastion_enabled ? 1 : 0

  enabled           = local.debug_bastion_enabled
  sna_enabled       = var.network.sna_enabled
  project_id        = stackit_resourcemanager_project.this.project_id
  network_id        = stackit_network.sna[0].network_id
  name              = local.debug_bastion_name
  short_prefix      = local.debug_bastion_short_prefix
  availability_zone = var.debug_bastion.availability_zone
  machine_type      = var.debug_bastion.machine_type
  image_id          = var.debug_bastion.image_id
  boot_volume_size  = var.debug_bastion.boot_volume_size

  ssh_public_key      = var.debug_bastion.ssh_public_key
  ssh_public_key_path = var.debug_bastion.ssh_public_key_path
  ssh_allowed_cidrs   = var.debug_bastion.ssh_allowed_cidrs
  assign_public_ip    = var.debug_bastion.assign_public_ip
  install_kubectl     = var.debug_bastion.install_kubectl
}
