locals {
  ssh_public_key = var.enabled ? try(
    trimspace(var.ssh_public_key),
    trimspace(file(pathexpand(var.ssh_public_key_path))),
    null
  ) : null

  user_data = var.install_kubectl ? (
    <<EOT
#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
runcmd:
  - curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.33/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
  - echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.33/deb/ /' > /etc/apt/sources.list.d/kubernetes.list
  - apt-get update
  - apt-get install -y kubectl
EOT
  ) : null
}

resource "stackit_key_pair" "this" {
  count = var.enabled ? 1 : 0

  name       = "${var.short_prefix}-dbg-key"
  public_key = local.ssh_public_key

  lifecycle {
    precondition {
      condition     = var.sna_enabled
      error_message = "debug_bastion requires sna_enabled=true."
    }

    precondition {
      condition     = local.ssh_public_key != null && local.ssh_public_key != ""
      error_message = "debug_bastion requires a non-empty ssh_public_key or valid ssh_public_key_path."
    }
  }
}

resource "stackit_security_group" "this" {
  count = var.enabled ? 1 : 0

  project_id  = var.project_id
  name        = "${var.short_prefix}-dbg-sg"
  description = "Debug bastion SSH access"
  stateful    = true
}

resource "stackit_security_group_rule" "ssh" {
  for_each = var.enabled ? {
    for cidr in var.ssh_allowed_cidrs : cidr => cidr
  } : {}

  project_id        = var.project_id
  security_group_id = stackit_security_group.this[0].security_group_id
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

resource "stackit_network_interface" "this" {
  count = var.enabled ? 1 : 0

  project_id         = var.project_id
  network_id         = var.network_id
  name               = "${var.name}-nic"
  security           = true
  security_group_ids = [stackit_security_group.this[0].security_group_id]
}

resource "stackit_server" "this" {
  count = var.enabled ? 1 : 0

  project_id = var.project_id
  name       = var.name

  boot_volume = {
    source_type = "image"
    source_id   = var.image_id
    size        = var.boot_volume_size
  }

  availability_zone = var.availability_zone
  machine_type      = var.machine_type
  keypair_name      = stackit_key_pair.this[0].name
  network_interfaces = [
    stackit_network_interface.this[0].network_interface_id
  ]
  user_data = local.user_data
}

resource "stackit_public_ip" "this" {
  count = var.enabled && var.assign_public_ip ? 1 : 0

  project_id           = var.project_id
  network_interface_id = stackit_network_interface.this[0].network_interface_id
}
