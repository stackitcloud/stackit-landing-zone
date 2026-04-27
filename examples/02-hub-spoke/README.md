<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.88.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_connectivity_global"></a> [connectivity\_global](#module\_connectivity\_global) | ../../modules/connectivity-global | n/a |
| <a name="module_connectivity_regional"></a> [connectivity\_regional](#module\_connectivity\_regional) | ../../modules/connectivity-regional | n/a |
| <a name="module_devops"></a> [devops](#module\_devops) | ../../modules/devops | n/a |
| <a name="module_governance"></a> [governance](#module\_governance) | ../../modules/governance | n/a |
| <a name="module_landing_zone"></a> [landing\_zone](#module\_landing\_zone) | ../../modules/landing-zone | n/a |
| <a name="module_management"></a> [management](#module\_management) | ../../modules/management | n/a |
| <a name="module_sandboxes"></a> [sandboxes](#module\_sandboxes) | ../../modules/sandboxes | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_company_code"></a> [company\_code](#input\_company\_code) | Company code used in resource naming conventions. | `string` | n/a | yes |
| <a name="input_company_name"></a> [company\_name](#input\_company\_name) | Name of the company. | `string` | n/a | yes |
| <a name="input_connectivity_regional_network_area"></a> [connectivity\_regional\_network\_area](#input\_connectivity\_regional\_network\_area) | Name key of the network area (from network\_areas) to use for the regional connectivity project. | `string` | n/a | yes |
| <a name="input_connectivity_vnet_range"></a> [connectivity\_vnet\_range](#input\_connectivity\_vnet\_range) | CIDR range for the connectivity project VNet. | `string` | `"10.0.0.0/24"` | no |
| <a name="input_firewall_flavor"></a> [firewall\_flavor](#input\_firewall\_flavor) | Firewall VM flavor. | `string` | `"c1.2"` | no |
| <a name="input_firewall_ip"></a> [firewall\_ip](#input\_firewall\_ip) | Static IP address for the firewall LAN interface. | `string` | `"10.0.0.220"` | no |
| <a name="input_firewall_zone"></a> [firewall\_zone](#input\_firewall\_zone) | STACKIT Availability Zone for the firewall VM. | `string` | `"eu01-m"` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_landing_zone_admins"></a> [landing\_zone\_admins](#input\_landing\_zone\_admins) | List of landing zone administrators. | `list(string)` | `[]` | no |
| <a name="input_landing_zones"></a> [landing\_zones](#input\_landing\_zones) | Map of landing zones to create. Set corporate = true for network area connectivity, false for public. | <pre>map(object({<br/>    project_name = string<br/>    project_code = string<br/>    owner_email  = string<br/>    # Set to true for corporate landing zones (connected to network area), false for public<br/>    corporate = optional(bool, true)<br/>    env       = optional(string, "dev")<br/>    role_assignments = optional(list(object({<br/>      role    = string<br/>      subject = string<br/>    })), [])<br/>    network_prefix_length = optional(number, null)<br/>    custom_roles = optional(list(object({<br/>      name        = string<br/>      description = string<br/>      permissions = list(string)<br/>    })), [])<br/>    kubernetes_clusters = optional(map(object({<br/>      kubernetes_version                   = string<br/>      enable_kubernetes_version_updates    = optional(bool, true)<br/>      enable_machine_image_version_updates = optional(bool, true)<br/>      hibernations = optional(list(object({<br/>        start    = string<br/>        end      = string<br/>        timezone = optional(string, "Europe/Berlin")<br/>      })), [])<br/>      node_pools = list(object({<br/>        name               = string<br/>        machine_type       = string<br/>        availability_zones = list(string)<br/>        os_version_min     = optional(string)<br/>        minimum            = number<br/>        maximum            = number<br/>        max_surge          = optional(number)<br/>        max_unavailable    = optional(number)<br/>        labels             = optional(map(string))<br/>        taints = optional(list(object({<br/>          key    = string<br/>          value  = string<br/>          effect = string<br/>        })))<br/>      }))<br/>      extensions = optional(object({<br/>        acl = optional(object({<br/>          allowed_cidrs = list(string)<br/>          enabled       = bool<br/>        }))<br/>        dns = optional(object({<br/>          enabled = bool<br/>          zones   = optional(list(string))<br/>        }))<br/>        observability = optional(object({<br/>          enabled     = bool<br/>          instance_id = optional(string)<br/>        }))<br/>      }))<br/>    })), {})<br/>  }))</pre> | `{}` | no |
| <a name="input_network_areas"></a> [network\_areas](#input\_network\_areas) | List of network areas to create with their IP ranges and configuration. | <pre>list(object({<br/>    name                   = string<br/>    network_ranges         = list(object({ prefix = string }))<br/>    transfer_network_range = string<br/>    max_prefix_length      = optional(number, 28)<br/>    min_prefix_length      = optional(number, 24)<br/>    default_prefix_length  = optional(number, 28)<br/>    default_nameservers    = optional(list(string), null)<br/>  }))</pre> | n/a | yes |
| <a name="input_organization_auditors"></a> [organization\_auditors](#input\_organization\_auditors) | List of organization auditors. | `list(string)` | `[]` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root organization. | `string` | n/a | yes |
| <a name="input_organization_owners"></a> [organization\_owners](#input\_organization\_owners) | List of organization owners. | `list(string)` | `[]` | no |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for regional resources. | `string` | `"eu01"` | no |
| <a name="input_sandboxes"></a> [sandboxes](#input\_sandboxes) | List of sandboxes to create. | <pre>list(object({<br/>    project_name        = string<br/>    owner_emails        = optional(list(string))<br/>    project_owner_email = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_connectivity_global_network_area_ids"></a> [connectivity\_global\_network\_area\_ids](#output\_connectivity\_global\_network\_area\_ids) | Map of network area names to their IDs. |
| <a name="output_connectivity_regional_pfsense_public_ip"></a> [connectivity\_regional\_pfsense\_public\_ip](#output\_connectivity\_regional\_pfsense\_public\_ip) | The public IP of the pfSense firewall. |
| <a name="output_connectivity_regional_pfsense_wan_ip"></a> [connectivity\_regional\_pfsense\_wan\_ip](#output\_connectivity\_regional\_pfsense\_wan\_ip) | The internal WAN IP of the pfSense firewall (used as next hop). |
| <a name="output_connectivity_regional_project_id"></a> [connectivity\_regional\_project\_id](#output\_connectivity\_regional\_project\_id) | The project ID of the regional connectivity project. |
| <a name="output_devops_project_id"></a> [devops\_project\_id](#output\_devops\_project\_id) | The project ID of the DevOps project. |
| <a name="output_governance_folder_ids"></a> [governance\_folder\_ids](#output\_governance\_folder\_ids) | Map of governance folder names to their container IDs. |
| <a name="output_landing_zone_projects"></a> [landing\_zone\_projects](#output\_landing\_zone\_projects) | Map of landing zone project IDs. |
| <a name="output_management_project_id"></a> [management\_project\_id](#output\_management\_project\_id) | The project ID of the Management project. |
| <a name="output_sandbox_projects"></a> [sandbox\_projects](#output\_sandbox\_projects) | The created sandbox projects. |
<!-- END_TF_DOCS -->