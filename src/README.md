<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.96.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | 0.14.0 |
| <a name="requirement_vault"></a> [vault](#requirement\_vault) | 5.9.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_connectivity"></a> [connectivity](#module\_connectivity) | ./modules/connectivity | n/a |
| <a name="module_devops"></a> [devops](#module\_devops) | ./modules/devops | n/a |
| <a name="module_governance"></a> [governance](#module\_governance) | ./modules/governance | n/a |
| <a name="module_landing_zone"></a> [landing\_zone](#module\_landing\_zone) | ./modules/landing-zone | n/a |
| <a name="module_management"></a> [management](#module\_management) | ./modules/management | n/a |
| <a name="module_sandboxes"></a> [sandboxes](#module\_sandboxes) | ./modules/sandboxes | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_company_code"></a> [company\_code](#input\_company\_code) | Company code used in resource naming conventions. | `string` | n/a | yes |
| <a name="input_company_name"></a> [company\_name](#input\_company\_name) | Name of the company. | `string` | n/a | yes |
| <a name="input_connectivity"></a> [connectivity](#input\_connectivity) | Connectivity configuration including DNS zones, network area, and firewall. Set firewall/network\_area to null to skip deployment. | <pre>object({<br/>    dns_zones = optional(map(object({<br/>      dns_name      = string<br/>      name          = optional(string, null)<br/>      contact_email = optional(string, null)<br/>      type          = optional(string, "primary")<br/>      acl           = optional(string, null)<br/>      description   = optional(string, null)<br/>      default_ttl   = optional(number, 3600)<br/>    })), {})<br/>    network_area = optional(object({<br/>      ranges                = list(string)<br/>      transfer_network      = string<br/>      min_prefix_length     = optional(number, 24)<br/>      max_prefix_length     = optional(number, 28)<br/>      default_prefix_length = optional(number, 28)<br/>    }), null)<br/>    firewall = optional(object({<br/>      zone                     = string<br/>      flavor                   = string<br/>      name                     = string<br/>      volume_performance_class = optional(string, "storage_premium_perf4")<br/>      volume_size              = optional(number, 16)<br/>      lan_network_range        = string<br/>      wan_network_range        = string<br/>      lan_ip                   = optional(string, null)<br/>      wan_ip                   = optional(string, null)<br/>    }), null)<br/>  })</pre> | `null` | no |
| <a name="input_devops"></a> [devops](#input\_devops) | DevOps module configuration. Set to null to skip deployment. | <pre>object({<br/>    git_flavor             = optional(string, null)<br/>    allowed_network_ranges = optional(list(string), ["0.0.0.0/0"])<br/>  })</pre> | `null` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all resources. | `map(string)` | `{}` | no |
| <a name="input_landing_zones"></a> [landing\_zones](#input\_landing\_zones) | Map of landing zones to create. Set corporate = true for network area connectivity, false for public. | <pre>map(object({<br/>    project_name = string<br/>    project_code = string<br/>    owner_email  = string<br/>    # Set to true for corporate landing zones (connected to network area), false for public<br/>    corporate = optional(bool, true)<br/>    env       = optional(string, "dev")<br/>    role_assignments = optional(list(object({<br/>      role    = string<br/>      subject = string<br/>    })), [])<br/>    network_prefix_length = optional(number, null)<br/>    custom_roles = optional(list(object({<br/>      name        = string<br/>      description = string<br/>      permissions = list(string)<br/>    })), [])<br/>  }))</pre> | `{}` | no |
| <a name="input_observability"></a> [observability](#input\_observability) | Observability instance configuration for the management module. Set to null to skip observability deployment. | <pre>object({<br/>    plan_name                              = optional(string, "Observability-Starter-EU01")<br/>    acl                                    = optional(list(string), [])<br/>    logs_retention_days                    = optional(number, 30)<br/>    traces_retention_days                  = optional(number, 30)<br/>    metrics_retention_days                 = optional(number, 90)<br/>    metrics_retention_days_5m_downsampling = optional(number, 90)<br/>    metrics_retention_days_1h_downsampling = optional(number, 90)<br/>  })</pre> | `null` | no |
| <a name="input_organization_auditors"></a> [organization\_auditors](#input\_organization\_auditors) | List of organization auditors. | `list(string)` | `[]` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root organization. | `string` | n/a | yes |
| <a name="input_organization_owners"></a> [organization\_owners](#input\_organization\_owners) | List of organization owners. | `list(string)` | `[]` | no |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for regional resources. | `string` | `"eu01"` | no |
| <a name="input_rm_folder_parent_id"></a> [rm\_folder\_parent\_id](#input\_rm\_folder\_parent\_id) | ID of the parent folder under which the resource manager folders will be created. If not provided, the resource manager folders will be created under the organization. | `string` | `null` | no |
| <a name="input_rm_folders"></a> [rm\_folders](#input\_rm\_folders) | Map of resource manager folders to create under the root organization. | <pre>map(object({<br/>    name          = string<br/>    description   = optional(string, null)<br/>    owner_emails  = list(string)<br/>    reader_emails = list(string)<br/>  }))</pre> | <pre>{<br/>  "landing_zones_corporate": {<br/>    "name": "Landing Zones - Corporate",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "landing_zones_public": {<br/>    "name": "Landing Zones - Public",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "platform": {<br/>    "name": "Platform",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  },<br/>  "sandboxes": {<br/>    "name": "Sandboxes",<br/>    "owner_emails": [],<br/>    "reader_emails": []<br/>  }<br/>}</pre> | no |
| <a name="input_sandboxes"></a> [sandboxes](#input\_sandboxes) | List of sandboxes to create. | <pre>list(object({<br/>    project_name        = string<br/>    owner_emails        = optional(list(string))<br/>    project_owner_email = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_connectivity_firewall_public_ip"></a> [connectivity\_firewall\_public\_ip](#output\_connectivity\_firewall\_public\_ip) | The public IP of the firewall. |
| <a name="output_connectivity_network_area_id"></a> [connectivity\_network\_area\_id](#output\_connectivity\_network\_area\_id) | The network area ID created by the regional module. |
| <a name="output_connectivity_project_id"></a> [connectivity\_project\_id](#output\_connectivity\_project\_id) | The project ID of the connectivity project. |
| <a name="output_devops_project_id"></a> [devops\_project\_id](#output\_devops\_project\_id) | The project ID of the DevOps project. |
| <a name="output_governance_folder_ids"></a> [governance\_folder\_ids](#output\_governance\_folder\_ids) | Map of governance folder names to their container IDs. |
| <a name="output_landing_zone_projects"></a> [landing\_zone\_projects](#output\_landing\_zone\_projects) | Map of landing zone project IDs. |
| <a name="output_management_bucket_name_tfstate"></a> [management\_bucket\_name\_tfstate](#output\_management\_bucket\_name\_tfstate) | The name of the Management tfstate object storage bucket. |
| <a name="output_management_project_id"></a> [management\_project\_id](#output\_management\_project\_id) | The project ID of the Management project. |
| <a name="output_sandbox_projects"></a> [sandbox\_projects](#output\_sandbox\_projects) | The created sandbox projects. |
<!-- END_TF_DOCS -->