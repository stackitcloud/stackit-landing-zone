<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.93.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >= 0.13.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.93.0 |
| <a name="provider_time"></a> [time](#provider\_time) | >= 0.13.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_dns_zone.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/dns_zone) | resource |
| [stackit_image.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/image) | resource |
| [stackit_network.lan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network) | resource |
| [stackit_network.wan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network) | resource |
| [stackit_network_area.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area) | resource |
| [stackit_network_area_region.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area_region) | resource |
| [stackit_network_interface.lan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_interface) | resource |
| [stackit_network_interface.wan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_interface) | resource |
| [stackit_public_ip.wan-ip](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/public_ip) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_project) | resource |
| [stackit_routing_table.wan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/routing_table) | resource |
| [stackit_routing_table_route.wan](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/routing_table_route) | resource |
| [stackit_server.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/server) | resource |
| [stackit_volume.firewall](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/volume) | resource |
| [time_sleep.wait_before_network_area_region_destroy](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |
| [time_sleep.wait_for_network_area](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_dns_zones"></a> [dns\_zones](#input\_dns\_zones) | Map of DNS zone keys to DNS zone configuration. Name defaults to dns\_name if not set. | <pre>map(object({<br/>    dns_name      = string<br/>    name          = optional(string, null)<br/>    contact_email = optional(string, null)<br/>    type          = optional(string, "primary")<br/>    acl           = optional(string, null)<br/>    description   = optional(string, null)<br/>    default_ttl   = optional(number, 3600)<br/>  }))</pre> | `{}` | no |
| <a name="input_firewall"></a> [firewall](#input\_firewall) | Firewall configuration. Set to null to skip firewall deployment (network area and routing are still created). lan\_network\_range and wan\_network\_range must be CIDRs within the network area range. lan\_ip and wan\_ip are optional; when omitted, the 5th address of the respective prefix is used (STACKIT reserves the first usable address as the gateway). | <pre>object({<br/>    zone                     = string<br/>    flavor                   = string<br/>    name                     = string<br/>    volume_performance_class = optional(string, "storage_premium_perf4")<br/>    volume_size              = optional(number, 16)<br/>    lan_network_range        = string<br/>    wan_network_range        = string<br/>    lan_ip                   = optional(string, null)<br/>    wan_ip                   = optional(string, null)<br/>  })</pre> | `null` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for all resources in this module, e.g. "myco-pltfm-hub-prod". | `string` | n/a | yes |
| <a name="input_network_area"></a> [network\_area](#input\_network\_area) | Network area configuration including IP ranges, transfer network, and prefix length settings. | <pre>object({<br/>    ranges                = list(string)<br/>    transfer_network      = string<br/>    min_prefix_length     = optional(number, 24)<br/>    max_prefix_length     = optional(number, 28)<br/>    default_prefix_length = optional(number, 28)<br/>    default_nameservers   = optional(list(string), ["1.0.0.1", "1.1.1.1"])<br/>  })</pre> | n/a | yes |
| <a name="input_network_area_name"></a> [network\_area\_name](#input\_network\_area\_name) | Name of the network area to create for this region. | `string` | `null` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Organization ID, required for network area and route configuration. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner for the project. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. Falls back to naming\_pattern if not set. | `string` | `null` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_dns_zone_dns_names"></a> [dns\_zone\_dns\_names](#output\_dns\_zone\_dns\_names) | Map of DNS zone keys to their DNS names |
| <a name="output_dns_zone_ids"></a> [dns\_zone\_ids](#output\_dns\_zone\_ids) | Map of DNS zone keys to their zone IDs |
| <a name="output_firewall_next_hop_ip"></a> [firewall\_next\_hop\_ip](#output\_firewall\_next\_hop\_ip) | The IP address to be used as next hop for the default route in the landing zones (firewall LAN IP). |
| <a name="output_firewall_public_ip"></a> [firewall\_public\_ip](#output\_firewall\_public\_ip) | The public IP address of the firewall WAN interface. |
| <a name="output_network_area_id"></a> [network\_area\_id](#output\_network\_area\_id) | The ID of the created network area. |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
<!-- END_TF_DOCS -->