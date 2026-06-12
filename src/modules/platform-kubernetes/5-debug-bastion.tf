locals {
  debug_bastion_enabled = var.debug_bastion.enabled && var.network.mode == "sna"

  debug_bastion_short_prefix = trim(replace(substr(var.naming_pattern, 0, 14), "/-{2,}/", "-"), "-")

  debug_bastion_name = var.debug_bastion.name != null ? var.debug_bastion.name : "${var.naming_pattern}-dbg"

  debug_bastion_ssh_public_key = local.debug_bastion_enabled ? (
    var.debug_bastion.ssh_public_key != null ? trimspace(var.debug_bastion.ssh_public_key) : trimspace(file(pathexpand(var.debug_bastion.ssh_public_key_path)))
  ) : null

  debug_bastion_user_data = var.debug_bastion.install_kubectl ? (
    <<EOT
#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
runcmd:
  - curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
  - echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' > /etc/apt/sources.list.d/kubernetes.list
  - apt-get update
  - apt-get install -y kubectl
EOT
  ) : null
}

check "debug_bastion_requires_sna" {
  assert {
    condition     = var.debug_bastion.enabled ? var.network.mode == "sna" : true
    error_message = "debug_bastion requires network.mode = \"sna\"."
  }
}

check "debug_bastion_ssh_key_required" {
  assert {
    condition     = !var.debug_bastion.enabled || local.debug_bastion_ssh_public_key != ""
    error_message = "debug_bastion requires a non-empty ssh_public_key or ssh_public_key_path."
  }
}

resource "stackit_key_pair" "debug_bastion" {
  count = local.debug_bastion_enabled ? 1 : 0

  name       = "${local.debug_bastion_short_prefix}-dbg-key"
  public_key = local.debug_bastion_ssh_public_key
}

resource "stackit_security_group" "debug_bastion" {
  count = local.debug_bastion_enabled ? 1 : 0

  project_id  = stackit_resourcemanager_project.this.project_id
  name        = "${local.debug_bastion_short_prefix}-dbg-sg"
  description = "Debug bastion SSH access"
  stateful    = true
}

resource "stackit_security_group_rule" "debug_bastion_ssh" {
  for_each = local.debug_bastion_enabled ? {
    for cidr in var.debug_bastion.ssh_allowed_cidrs : cidr => cidr
  } : {}

  project_id        = stackit_resourcemanager_project.this.project_id
  security_group_id = stackit_security_group.debug_bastion[0].security_group_id
  direction         = "ingress"
  ether_type        = "IPv4"
  ip_range          = each.value

  protocol = {
    name = "tcp"
  }

  port_range = {
    min = 22
    max = 22
  }
}

resource "stackit_network_interface" "debug_bastion" {
  count = local.debug_bastion_enabled ? 1 : 0

  project_id         = stackit_resourcemanager_project.this.project_id
  network_id         = stackit_network.sna[0].network_id
  name               = "${local.debug_bastion_name}-nic"
  security           = true
  security_group_ids = [stackit_security_group.debug_bastion[0].security_group_id]
}

resource "stackit_server" "debug_bastion" {
  count = local.debug_bastion_enabled ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  name       = local.debug_bastion_name

  boot_volume = {
    source_type = "image"
    source_id   = var.debug_bastion.image_id
    size        = var.debug_bastion.boot_volume_size
  }

  availability_zone = var.debug_bastion.availability_zone
  machine_type      = var.debug_bastion.machine_type
  keypair_name      = stackit_key_pair.debug_bastion[0].name
  network_interfaces = [
    stackit_network_interface.debug_bastion[0].network_interface_id
  ]
  user_data = local.debug_bastion_user_data
}

resource "stackit_public_ip" "debug_bastion" {
  count = local.debug_bastion_enabled && var.debug_bastion.assign_public_ip ? 1 : 0

  project_id           = stackit_resourcemanager_project.this.project_id
  network_interface_id = stackit_network_interface.debug_bastion[0].network_interface_id
}
