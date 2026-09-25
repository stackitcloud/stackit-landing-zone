<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.11 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | >= 0.114.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | >= 0.114.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [stackit_key_pair.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/key_pair) | resource |
| [stackit_network_interface.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_interface) | resource |
| [stackit_public_ip.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/public_ip) | resource |
| [stackit_security_group.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/security_group) | resource |
| [stackit_security_group_rule.ssh](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/security_group_rule) | resource |
| [stackit_server.this](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/server) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_assign_public_ip"></a> [assign\_public\_ip](#input\_assign\_public\_ip) | Whether to assign a public IP to bastion network interface. | `bool` | n/a | yes |
| <a name="input_availability_zone"></a> [availability\_zone](#input\_availability\_zone) | Availability zone for the bastion server. | `string` | `null` | no |
| <a name="input_boot_volume_size"></a> [boot\_volume\_size](#input\_boot\_volume\_size) | Boot volume size in GB. | `number` | n/a | yes |
| <a name="input_enabled"></a> [enabled](#input\_enabled) | Whether debug bastion resources should be created. | `bool` | n/a | yes |
| <a name="input_image_id"></a> [image\_id](#input\_image\_id) | Image ID for the bastion boot volume. | `string` | n/a | yes |
| <a name="input_install_kubectl"></a> [install\_kubectl](#input\_install\_kubectl) | Whether to install kubectl via cloud-init. | `bool` | n/a | yes |
| <a name="input_machine_type"></a> [machine\_type](#input\_machine\_type) | Machine type for the bastion server. | `string` | n/a | yes |
| <a name="input_name"></a> [name](#input\_name) | Bastion server name. | `string` | n/a | yes |
| <a name="input_network_id"></a> [network\_id](#input\_network\_id) | SNA network ID for the bastion network interface. | `string` | n/a | yes |
| <a name="input_project_id"></a> [project\_id](#input\_project\_id) | STACKIT project ID where bastion resources are created. | `string` | n/a | yes |
| <a name="input_short_prefix"></a> [short\_prefix](#input\_short\_prefix) | Short naming prefix for key/security-group resources. | `string` | n/a | yes |
| <a name="input_sna_enabled"></a> [sna\_enabled](#input\_sna\_enabled) | Whether SNA networking is enabled for the cluster. | `bool` | n/a | yes |
| <a name="input_ssh_allowed_cidrs"></a> [ssh\_allowed\_cidrs](#input\_ssh\_allowed\_cidrs) | CIDRs allowed for SSH ingress. | `list(string)` | n/a | yes |
| <a name="input_ssh_public_key"></a> [ssh\_public\_key](#input\_ssh\_public\_key) | Optional inline SSH public key. | `string` | `null` | no |
| <a name="input_ssh_public_key_path"></a> [ssh\_public\_key\_path](#input\_ssh\_public\_key\_path) | Path to SSH public key file when inline key is not provided. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_enabled"></a> [enabled](#output\_enabled) | Whether bastion resources are enabled. |
| <a name="output_network_interface_id"></a> [network\_interface\_id](#output\_network\_interface\_id) | Bastion network interface ID when enabled. |
| <a name="output_public_ip"></a> [public\_ip](#output\_public\_ip) | Bastion public IP when enabled and assign\_public\_ip=true. |
| <a name="output_server_id"></a> [server\_id](#output\_server\_id) | Bastion server ID when enabled. |
| <a name="output_ssh_command"></a> [ssh\_command](#output\_ssh\_command) | Ready-to-use SSH command when public IP is assigned. |
| <a name="output_ssh_user"></a> [ssh\_user](#output\_ssh\_user) | Default SSH user for bastion access. |
<!-- END_TF_DOCS -->
