moved {
  from = stackit_network_area.this
  to   = stackit_network_area.this["default"]
}

moved {
  from = stackit_network_area_region.this
  to   = stackit_network_area_region.this["default"]
}

moved {
  from = time_sleep.wait_before_network_area_region_destroy
  to   = time_sleep.wait_before_network_area_region_destroy["default"]
}

moved {
  from = stackit_resourcemanager_project.this
  to   = stackit_resourcemanager_project.this["default"]
}

moved {
  from = time_sleep.wait_for_network_area
  to   = time_sleep.wait_for_network_area["default"]
}

moved {
  from = stackit_routing_table.wan
  to   = stackit_routing_table.wan["default"]
}

moved {
  from = stackit_routing_table_route.wan
  to   = stackit_routing_table_route.wan["default"]
}

moved {
  from = stackit_network.wan[0]
  to   = stackit_network.wan["default"]
}

moved {
  from = stackit_network_interface.wan[0]
  to   = stackit_network_interface.wan["default"]
}

moved {
  from = stackit_public_ip.wan-ip[0]
  to   = stackit_public_ip.wan-ip["default"]
}

moved {
  from = stackit_network_interface.wan_backup[0]
  to   = stackit_network_interface.wan_backup["default"]
}

moved {
  from = stackit_public_ip.wan-ip_backup[0]
  to   = stackit_public_ip.wan-ip_backup["default"]
}

moved {
  from = stackit_network.lan[0]
  to   = stackit_network.lan["default"]
}

moved {
  from = stackit_network_interface.lan[0]
  to   = stackit_network_interface.lan["default"]
}

moved {
  from = stackit_network_interface.lan_backup[0]
  to   = stackit_network_interface.lan_backup["default"]
}

moved {
  from = stackit_image.firewall[0]
  to   = stackit_image.firewall["default"]
}

moved {
  from = stackit_volume.firewall[0]
  to   = stackit_volume.firewall["default"]
}

moved {
  from = stackit_server.firewall[0]
  to   = stackit_server.firewall["default"]
}

moved {
  from = stackit_volume.firewall_backup[0]
  to   = stackit_volume.firewall_backup["default"]
}

moved {
  from = stackit_server.firewall_backup[0]
  to   = stackit_server.firewall_backup["default"]
}

moved {
  from = random_password.carp[0]
  to   = random_password.carp["default"]
}

moved {
  from = terraform_data.firewall_ha_backup[0]
  to   = terraform_data.firewall_ha_backup["default"]
}

moved {
  from = terraform_data.firewall_ha_primary[0]
  to   = terraform_data.firewall_ha_primary["default"]
}

moved {
  from = stackit_vpn_gateway.this[0]
  to   = stackit_vpn_gateway.this["default"]
}

moved {
  from = data.stackit_vpn_gateway_status.this[0]
  to   = data.stackit_vpn_gateway_status.this["default"]
}