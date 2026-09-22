<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.11 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >= 0.114.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | >= 0.14.1 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.116.0 |
| <a name="provider_time"></a> [time](#provider\_time) | 0.14.2 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_debug_bastion"></a> [debug\_bastion](#module\_debug\_bastion) | ../debug-bastion | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [stackit_authorization_project_role_assignment.kms_admin](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_authorization_project_role_assignment.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_authorization_service_account_role_assignment.ske_impersonation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/authorization_service_account_role_assignment) | resource |
| [stackit_dns_zone.ske_extension](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/dns_zone) | resource |
| [stackit_kms_key.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/kms_key) | resource |
| [stackit_kms_keyring.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/kms_keyring) | resource |
| [stackit_network.sna](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network) | resource |
| [stackit_observability_instance.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/observability_instance) | resource |
| [stackit_resourcemanager_project.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/resourcemanager_project) | resource |
| [stackit_routing_table.sna_egress](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/routing_table) | resource |
| [stackit_routing_table_route.sna_default_route](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/routing_table_route) | resource |
| [stackit_service_account.kms_manager](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/service_account) | resource |
| [stackit_ske_cluster.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/ske_cluster) | resource |
| [stackit_ske_kubeconfig.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/ske_kubeconfig) | resource |
| [time_sleep.wait_for_network_area_membership](https://registry.terraform.io/providers/hashicorp/time/latest/docs/resources/sleep) | resource |
| [stackit_service_accounts.ske_internal](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/data-sources/service_accounts) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_cluster"></a> [cluster](#input\_cluster) | SKE cluster configuration. | <pre>object({<br/>    name                   = string<br/>    kubernetes_version_min = optional(string, null)<br/>    node_pools = optional(list(object({<br/>      name                    = string<br/>      machine_type            = string<br/>      minimum                 = number<br/>      maximum                 = number<br/>      availability_zones      = list(string)<br/>      allow_system_components = optional(bool, false)<br/>      volume_size             = optional(number, 20)<br/>      volume_type             = optional(string, "storage_premium_perf1")<br/>      os_name                 = optional(string, "flatcar")<br/>      labels                  = optional(map(string), {})<br/>      })), [<br/>      {<br/>        name                    = "system"<br/>        machine_type            = "g3i.4"<br/>        minimum                 = 2<br/>        maximum                 = 2<br/>        availability_zones      = ["eu01-1"]<br/>        allow_system_components = true<br/>        volume_size             = 20<br/>        volume_type             = "storage_premium_perf1"<br/>        os_name                 = "flatcar"<br/>        labels = {<br/>          "workload-role" = "system"<br/>        }<br/>      },<br/>      {<br/>        name                    = "application"<br/>        machine_type            = "g3i.4"<br/>        minimum                 = 2<br/>        maximum                 = 2<br/>        availability_zones      = ["eu01-2"]<br/>        allow_system_components = false<br/>        volume_size             = 20<br/>        volume_type             = "storage_premium_perf1"<br/>        os_name                 = "flatcar"<br/>        labels = {<br/>          "workload-role" = "application"<br/>        }<br/>      }<br/>    ])<br/>    maintenance = optional(object({<br/>      enable_kubernetes_version_updates    = optional(bool, true)<br/>      enable_machine_image_version_updates = optional(bool, true)<br/>      start                                = optional(string, "01:00:00Z")<br/>      end                                  = optional(string, "02:00:00Z")<br/>    }), {})<br/>  })</pre> | n/a | yes |
| <a name="input_debug_bastion"></a> [debug\_bastion](#input\_debug\_bastion) | Optional debug bastion VM in the SNA network with SSH access to test SKE connectivity from inside the private network. | <pre>object({<br/>    enabled             = optional(bool, false)<br/>    name                = optional(string, null)<br/>    availability_zone   = optional(string, null)<br/>    machine_type        = optional(string, "g2i.1")<br/>    image_id            = optional(string, "7b10e105-295b-4369-b6e0-567ec940a02b")<br/>    boot_volume_size    = optional(number, 20)<br/>    ssh_public_key      = optional(string, null)<br/>    ssh_public_key_path = optional(string, "~/.ssh/id_rsa.pub")<br/>    ssh_allowed_cidrs   = optional(list(string), ["0.0.0.0/0"])<br/>    assign_public_ip    = optional(bool, true)<br/>    install_kubectl     = optional(bool, true)<br/>  })</pre> | `{}` | no |
| <a name="input_dns"></a> [dns](#input\_dns) | SKE DNS extension configuration. If create\_zones is true, zones are created in the platform project before cluster creation. gateway\_api enables Gateway API support for ExternalDNS. | <pre>object({<br/>    enabled      = optional(bool, true)<br/>    create_zones = optional(bool, true)<br/>    zones        = optional(list(string), [])<br/>    gateway_api  = optional(bool, true)<br/>  })</pre> | `{}` | no |
| <a name="input_encrypted_volumes"></a> [encrypted\_volumes](#input\_encrypted\_volumes) | Optional encrypted volume setup for SKE via KMS and Kubernetes storage class. | <pre>object({<br/>    enabled            = optional(bool, false)<br/>    storage_class_name = optional(string, "stackit-encrypted-premium")<br/>    kms_keyring_name   = optional(string, "ske-volume-keyring")<br/>    kms_key_name       = optional(string, "ske-volume-key")<br/>    kms_key_version    = optional(string, "1")<br/>  })</pre> | `{}` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to resources in this module. | `map(string)` | `{}` | no |
| <a name="input_naming_pattern"></a> [naming\_pattern](#input\_naming\_pattern) | Naming prefix for resources in this module, e.g. myco-pltfm-k8s-eu01. | `string` | n/a | yes |
| <a name="input_network"></a> [network](#input\_network) | Network settings for SKE. Set sna\_enabled=true and provide sna\_network\_area\_id for SNA; otherwise the cluster runs in public control-plane mode. | <pre>object({<br/>    sna_enabled               = optional(bool, false)<br/>    sna_network_area_id       = optional(string, null)<br/>    firewall_next_hop_ip      = optional(string, null)<br/>    sna_network_prefix_length = optional(number, 24)<br/>  })</pre> | `{}` | no |
| <a name="input_observability"></a> [observability](#input\_observability) | Observability configuration for central cluster monitoring in the same project as the cluster. | <pre>object({<br/>    enabled   = optional(bool, true)<br/>    plan_name = optional(string, "Observability-Starter-EU01")<br/>    acl       = optional(list(string), [])<br/>    name      = optional(string, null)<br/>  })</pre> | `{}` | no |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Organization ID used for routing table resources in network-area scope. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the project owner. Required for project creation. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | `null` | no |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for the SKE cluster. | `string` | n/a | yes |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_debug_bastion"></a> [debug\_bastion](#output\_debug\_bastion) | Debug bastion metadata when enabled for private cluster troubleshooting. |
| <a name="output_dns_extension_zones"></a> [dns\_extension\_zones](#output\_dns\_extension\_zones) | DNS zones configured for SKE DNS extension. |
| <a name="output_encrypted_volume_support"></a> [encrypted\_volume\_support](#output\_encrypted\_volume\_support) | Configuration values for encrypted SKE volumes when enabled. |
| <a name="output_kube_config"></a> [kube\_config](#output\_kube\_config) | Kubeconfig for the created SKE cluster. |
| <a name="output_observability_instance_id"></a> [observability\_instance\_id](#output\_observability\_instance\_id) | The observability instance ID used for cluster extension. |
| <a name="output_observability_targets_url"></a> [observability\_targets\_url](#output\_observability\_targets\_url) | The Prometheus query endpoint URL of the optional platform observability instance. |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
| <a name="output_ske_cluster_name"></a> [ske\_cluster\_name](#output\_ske\_cluster\_name) | The name of the created SKE cluster. |
| <a name="output_ske_cluster_region"></a> [ske\_cluster\_region](#output\_ske\_cluster\_region) | The region of the created SKE cluster. |
<!-- END_TF_DOCS -->
