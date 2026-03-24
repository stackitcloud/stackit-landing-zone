<!-- BEGIN_TF_DOCS -->
### Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >=0.88.0 |

### Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.88.0 |

### Modules

No modules.

### Resources

| Name | Type |
|------|------|
| [stackit_network_area.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area) | resource |
| [stackit_network_area_region.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area_region) | resource |
| [stackit_network_area_route.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area_route) | resource |

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_network_areas"></a> [network\_areas](#input\_network\_areas) | List of network areas to create, each with its own name, ranges, and configuration. | <pre>list(object({<br/>    name                   = string<br/>    network_ranges         = list(object({ prefix = string }))<br/>    transfer_network_range = string<br/>    max_prefix_length      = optional(number, 28)<br/>    min_prefix_length      = optional(number, 24)<br/>    default_prefix_length  = optional(number, 28)<br/>    default_nameservers    = optional(list(string), null)<br/>  }))</pre> | n/a | yes |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Container ID of the root folder or organization under which the company folder will be created. | `string` | n/a | yes |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all folders. | `map(string)` | `{}` | no |
| <a name="input_network_area_id"></a> [network\_area\_id](#input\_network\_area\_id) | Network Area ID to deploy resources into. Required if network is enabled. | `string` | `null` | no |
| <a name="input_network_area_routes"></a> [network\_area\_routes](#input\_network\_area\_routes) | List of static routes to create within network areas. Each route references a network area by name. | <pre>list(object({<br/>    name              = string<br/>    network_area_name = string<br/>    destination = object({<br/>      type  = string<br/>      value = string<br/>    })<br/>    next_hop = object({<br/>      type  = string<br/>      value = optional(string)<br/>    })<br/>  }))</pre> | `[]` | no |

### Outputs

| Name | Description |
|------|-------------|
| <a name="output_network_area_ids"></a> [network\_area\_ids](#output\_network\_area\_ids) | Map of network area names to their IDs. |
<!-- END_TF_DOCS -->