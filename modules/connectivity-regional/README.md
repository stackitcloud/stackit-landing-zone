# STACKIT pfSense Deployment

Terraform script to deploy an pfSense firewall into STACKIT Cloud.

Deployment overview:
![](deployment.svg)

The Terraform deployment consists of:
+ WAN Network
+ LAN Network
+ pfSense firewall VM + disk volume
+ FloatingIP for firewall VM
+ deactivating port security on firewall ports

## Setup
**Requirements:**
+ Terraform installed
+ Access to a STACKIT project
+ STACKIT Service Account Key

### Installation
1. Clone Repo
1. Set Project ID in `01-config.tf`
1. Create & Save a STACKIT Service Account Token and place it in the `secrets.json` file.
1. Run Terraform `terraform apply`

## Default Configuration

### Interfaces
1. `vtnet0` WAN
1. `vtnet1` LAN

### NAT
Masqurade (Outbound NAT) Traffic from `LAN` to `WAN`

### Dashboard
Customized Widgets and CSS settings

### Password
Set default password for admin to STACKIT123!

### Interface Access
Disabled Referer-Check
Enable allow all wan adresses to connect to the WebUI

Now you can enter the WebUI via the FloatingIP on port 443 the default login is admin:STACKIT123!
<!-- BEGIN_TF_DOCS -->
### Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.83.0 |

### Providers

| Name | Version |
|------|---------|
| <a name="provider_stackit"></a> [stackit](#provider\_stackit) | 0.83.0 |

### Modules

No modules.

### Resources

| Name | Type |
|------|------|
| [stackit_authorization_project_role_assignment.assignments](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/authorization_project_role_assignment) | resource |
| [stackit_image.pfsense_image](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/image) | resource |
| [stackit_network.lan](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network) | resource |
| [stackit_network.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network) | resource |
| [stackit_network_area_route.default](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network_area_route) | resource |
| [stackit_network_interface.lan](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network_interface) | resource |
| [stackit_network_interface.wan](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/network_interface) | resource |
| [stackit_public_ip.wan-ip](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/public_ip) | resource |
| [stackit_resourcemanager_project.project](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/resourcemanager_project) | resource |
| [stackit_server.pfsense_Server](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/server) | resource |
| [stackit_volume.pfsense_vol](https://registry.terraform.io/providers/stackitcloud/stackit/0.83.0/docs/resources/volume) | resource |

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_company_code"></a> [company\_code](#input\_company\_code) | Company code used in resource naming conventions. | `string` | n/a | yes |
| <a name="input_company_name"></a> [company\_name](#input\_company\_name) | Name of the company folder to create. | `string` | n/a | yes |
| <a name="input_network_area_id"></a> [network\_area\_id](#input\_network\_area\_id) | Network Area ID to deploy resources into. Required if network is enabled. | `string` | n/a | yes |
| <a name="input_organization_id"></a> [organization\_id](#input\_organization\_id) | Organization ID, required for network area route configuration. | `string` | n/a | yes |
| <a name="input_owner_email"></a> [owner\_email](#input\_owner\_email) | Email address of the owner for the folders. Required for STACKIT resource manager. | `string` | n/a | yes |
| <a name="input_parent_container_id"></a> [parent\_container\_id](#input\_parent\_container\_id) | Parent container ID (folder or organization) where the project will be created. | `string` | n/a | yes |
| <a name="input_project_code"></a> [project\_code](#input\_project\_code) | Optional project code for the STACKIT project. | `string` | n/a | yes |
| <a name="input_project_name"></a> [project\_name](#input\_project\_name) | Name of the STACKIT project to create. | `string` | n/a | yes |
| <a name="input_env"></a> [env](#input\_env) | Environment identifier (e.g., dev, staging, prod) used in resource naming conventions. | `string` | `"dev"` | no |
| <a name="input_firewall_flavor"></a> [firewall\_flavor](#input\_firewall\_flavor) | Firewall VM Flavor | `string` | `"c1.2"` | no |
| <a name="input_firewall_ip"></a> [firewall\_ip](#input\_firewall\_ip) | IP address of the firewall | `string` | `"10.0.0.220"` | no |
| <a name="input_firewall_zone"></a> [firewall\_zone](#input\_firewall\_zone) | STACKIT Availability Zone | `string` | `"eu01-m"` | no |
| <a name="input_labels"></a> [labels](#input\_labels) | Additional labels to apply to all folders. | `map(string)` | `{}` | no |
| <a name="input_region"></a> [region](#input\_region) | STACKIT region for regional resources. | `string` | `"eu01"` | no |
| <a name="input_role_assignments"></a> [role\_assignments](#input\_role\_assignments) | List of role assignments for the project. Subject can be a user email or service account email. | <pre>list(object({<br/>    role    = string<br/>    subject = string<br/>  }))</pre> | `[]` | no |
| <a name="input_vnet_range"></a> [vnet\_range](#input\_vnet\_range) | CIDR range for the project VNet. Required if network is enabled. | `string` | `"10.0.0.0/24"` | no |

### Outputs

| Name | Description |
|------|-------------|
| <a name="output_pfsense_public_ip"></a> [pfsense\_public\_ip](#output\_pfsense\_public\_ip) | The public IP address of the pfSense firewall WAN interface. |
| <a name="output_pfsense_wan_ip"></a> [pfsense\_wan\_ip](#output\_pfsense\_wan\_ip) | The internal network area IP of the pfSense WAN interface (used as next hop in routes). |
| <a name="output_project_container_id"></a> [project\_container\_id](#output\_project\_container\_id) | The container ID of the created STACKIT project. |
| <a name="output_project_id"></a> [project\_id](#output\_project\_id) | The project ID of the created STACKIT project. |
| <a name="output_project_name"></a> [project\_name](#output\_project\_name) | The name of the created STACKIT project. |
<!-- END_TF_DOCS -->