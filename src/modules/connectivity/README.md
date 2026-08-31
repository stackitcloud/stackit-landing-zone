<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.101.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | ~> 0.14.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.93.0 |
| <a name="provider_time"></a> [time](#provider\_time) | ~> 0.14.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_dns_zone.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/dns_zone) | resource |
| [stackit_image.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/image) | resource |
| [stackit_network.lan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network) | resource |
| [stackit_network.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network) | resource |
| [stackit_network_area.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network_area) | resource |
| [stackit_network_area_region.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network_area_region) | resource |
| [stackit_network_interface.lan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network_interface) | resource |
| [stackit_network_interface.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/network_interface) | resource |
| [stackit_public_ip.wan-ip](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/public_ip) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/resourcemanager_project) | resource |
| [stackit_routing_table.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/routing_table) | resource |
| [stackit_routing_table_route.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/routing_table_route) | resource |
| [stackit_server.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/server) | resource |
| [stackit_volume.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/volume) | resource |
| [stackit_vpn_connection.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/vpn_connection) | resource |
| [stackit_vpn_gateway.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/resources/vpn_gateway) | resource |
| [time_sleep.wait_before_network_area_region_destroy](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |
| [time_sleep.wait_for_network_area](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |
| [stackit_vpn_gateway_status.this](https://registry.terraform.io/providers/stackitcloud/stackit/0.101.0/docs/data-sources/vpn_gateway_status) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_dns_zones"></a> [dns\_zones](#input\_dns\_zones) | Map of DNS zone keys to DNS zone configuration. Name defaults to dns\_name if not set. | <pre>map(object({<br/>    dns_name      = string<br/>    name          = optional(string, null)<br/>    contact_email = optional(string, null)<br/>    type          = optional(string, "primary")<br/>    acl           = optional(string, null)<br/>    description   = optional(string, null)<br/>    default_ttl   = optional(number, 3600)<br/>  }))</pre> | `{}` | no |
| <a name="input_firewall"></a> [firewall](#input\_firewall) | Firewall configuration. Set to null to skip firewall deployment (network area and routing are still created). lan\_network\_range and wan\_network\_range must be CIDRs within the network area range. lan\_ip and wan\_ip are optional; when omitted, the 5th address of the respective prefix is used (STACKIT reserves the first usable address as the gateway). | <pre>object({<br/>    zone                     = string<br/>    flavor                   = string<br/>    name                     = string<br/>    volume_performance_class = optional(string, "storage_premium_perf4")<br/>    volume_size              = optional(number, 16)<br/>    lan_network_range        = string<br/>    wan_network_range        = string<br/>    lan_ip                   = optional(string, null)<br/>    wan_ip                   = optional(string, null)<br/>  })</pre> | `null` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for all resources in this module, e.g. "myco-pltfm-hub-prod". | `string` | n/a | yes |
| <a name="input_network_areas"></a> [network\_areas](#input\_network\_areas) | List of network area configurations including IP ranges, transfer network, and prefix length settings. default\_nameservers falls back to the STACKIT resolvers of var.region when unset. | <pre>list(object({<br/>    name                = string<br/>    ranges              = list(string)<br/>    transfer_network    = bool<br/>    max_prefix_length   = number<br/>    min_prefix_length   = number<br/>    default_prefix_length = number<br/>    default_nameservers = list(string)<br/>  }))</pre> | `[]` | yes |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Organization ID, required for network area and route configuration. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner for the project. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. Falls back to naming\_pattern if not set. | `string` | `null` | no |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region the network area region is created in. Also selects the default resolvers when network\_area.default\_nameservers is unset. | `string` | `"eu01"` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |
| <a name="input_vpn"></a> [vpn](#input\_vpn) | IPsec VPN gateway for the hub, attached to the network area through the connectivity project. Set to null to skip. The gateway is HA: it terminates two tunnels in separate availability zones, each with its own public IP. Connections are created in a second apply once the remote peer addresses are known. Supports POLICY\_BASED and ROUTE\_BASED routing. | <pre>object({<br/>    display_name = optional(string, null)<br/>    plan_id      = optional(string, "p100")<br/>    routing_type = optional(string, "ROUTE_BASED")<br/>    availability_zones = object({<br/>      tunnel1 = string<br/>      tunnel2 = string<br/>    })<br/>    connections = optional(map(object({<br/>      display_name   = optional(string, null)<br/>      enabled        = optional(bool, true)<br/>      local_subnets  = optional(list(string), null)<br/>      remote_subnets = optional(list(string), null)<br/>      static_routes  = optional(list(string), null)<br/>      tunnel1 = object({<br/>        remote_address = string<br/>        peering = optional(object({<br/>          local_address  = string<br/>          remote_address = string<br/>        }), null)<br/>        phase1 = optional(object({<br/>          encryption_algorithms = optional(list(string), ["aes256"])<br/>          integrity_algorithms  = optional(list(string), ["sha2_384"])<br/>          dh_groups             = optional(list(string), ["ecp384"])<br/>          rekey_time            = optional(number, null)<br/>        }), {})<br/>        phase2 = optional(object({<br/>          encryption_algorithms = optional(list(string), ["aes256"])<br/>          integrity_algorithms  = optional(list(string), ["sha2_384"])<br/>          dh_groups             = optional(list(string), ["ecp384"])<br/>          rekey_time            = optional(number, null)<br/>          dpd_action            = optional(string, null)<br/>          start_action          = optional(string, null)<br/>        }), {})<br/>      })<br/>      tunnel2 = object({<br/>        remote_address = string<br/>        peering = optional(object({<br/>          local_address  = string<br/>          remote_address = string<br/>        }), null)<br/>        phase1 = optional(object({<br/>          encryption_algorithms = optional(list(string), ["aes256"])<br/>          integrity_algorithms  = optional(list(string), ["sha2_384"])<br/>          dh_groups             = optional(list(string), ["ecp384"])<br/>          rekey_time            = optional(number, null)<br/>        }), {})<br/>        phase2 = optional(object({<br/>          encryption_algorithms = optional(list(string), ["aes256"])<br/>          integrity_algorithms  = optional(list(string), ["sha2_384"])<br/>          dh_groups             = optional(list(string), ["ecp384"])<br/>          rekey_time            = optional(number, null)<br/>          dpd_action            = optional(string, null)<br/>          start_action          = optional(string, null)<br/>        }), {})<br/>      })<br/>    })), {})<br/>  })</pre> | `null` | no |
| <a name="input_vpn_pre_shared_keys"></a> [vpn\_pre\_shared\_keys](#input\_vpn\_pre\_shared\_keys) | Pre-shared keys per VPN connection key, one per tunnel. Kept separate from var.vpn so the connection topology stays committable; supply through TF\_VAR\_vpn\_pre\_shared\_keys or a gitignored tfvars file. Minimum 20 characters. | <pre>map(object({<br/>    tunnel1 = string<br/>    tunnel2 = string<br/>  }))</pre> | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_dns_zone_dns_names"></a> [dns\_zone\_dns\_names](#output\_dns\_zone\_dns\_names) | Map of DNS zone keys to their DNS names |
| <a name="output_dns_zone_ids"></a> [dns\_zone\_ids](#output\_dns\_zone\_ids) | Map of DNS zone keys to their zone IDs |
| <a name="output_firewall_next_hop_ip"></a> [firewall\_next\_hop\_ip](#output\_firewall\_next\_hop\_ip) | The IP address to be used as next hop for the default route in the landing zones (firewall LAN IP). |
| <a name="output_firewall_public_ip"></a> [firewall\_public\_ip](#output\_firewall\_public\_ip) | The public IP address of the firewall WAN interface. |
| <a name="output_network_area_id"></a> [network\_area\_id](#output\_network\_area\_id) | The ID of the created network area. |
| <a name="output_network_area_nameservers"></a> [network\_area\_nameservers](#output\_network\_area\_nameservers) | Resolvers configured as the network area default, either from network\_area.default\_nameservers or the STACKIT resolvers of the region. |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
| <a name="output_vpn_connection_ids"></a> [vpn\_connection\_ids](#output\_vpn\_connection\_ids) | Map of VPN connection keys to their connection IDs. |
| <a name="output_vpn_gateway_id"></a> [vpn\_gateway\_id](#output\_vpn\_gateway\_id) | The ID of the VPN gateway in the hub. |
| <a name="output_vpn_internal_next_hop_ips"></a> [vpn\_internal\_next\_hop\_ips](#output\_vpn\_internal\_next\_hop\_ips) | Map of VPN tunnel names to their network area side IP. Ping targets to verify a tunnel carries traffic into the SNA. |
| <a name="output_vpn_public_ips"></a> [vpn\_public\_ips](#output\_vpn\_public\_ips) | Map of VPN tunnel names to their public IP. These are the addresses the remote peer has to be configured against. |
<!-- END_TF_DOCS -->

## Multiple Network Areas

Pass `network_areas` as a map with meaningful keys, such as `prod` and `nonprod`. A separate connectivity project, network area, routing table, and optional VPN gateway is created for every key. Reference a key from `dns_zones.<zone>.network_area_key`; consumers of this module receive maps keyed the same way.

The firewall input is intentionally single-area: its LAN and WAN CIDRs are global inputs. Do not combine it with more than one network area. The root module's `connectivity.network_area` input remains available for a legacy single-area setup and maps to the `default` key.