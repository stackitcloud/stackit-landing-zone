output "network_area_ids" {
  description = "Map of network area names to their IDs."
  value       = { for name, area in stackit_network_area.areas : name => area.network_area_id }
}