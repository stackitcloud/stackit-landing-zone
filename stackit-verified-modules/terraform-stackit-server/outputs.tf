output "key_pairs" {
  description = "Map of created SSH key pairs."
  value = {
    for name, kp in stackit_key_pair.this : name => {
      name = kp.name
    }
  }
}

output "security_groups" {
  description = "Map of created security groups."
  value = {
    for name, sg in stackit_security_group.this : name => {
      security_group_id = sg.security_group_id
    }
  }
}

output "servers" {
  description = "Map of created servers with network interfaces and volumes."
  value = {
    for name, server in stackit_server.this : name => {
      id         = server.id
      server_id  = server.server_id
      name       = server.name
      created_at = server.created_at
      network_interface_id = (
        contains(keys(stackit_network_interface.this), name)
        ? stackit_network_interface.this[name].network_interface_id
        : null
      )
      volumes = {
        for key, vol in stackit_volume.this : vol.name => {
          volume_id = vol.volume_id
          name      = vol.name
        } if local.server_volumes[key].server_key == name
      }
    }
  }
}
