# terraform-stackit-kubernetes

Terraform module for managing STACKIT Kubernetes Engine (SKE) clusters.

## Usage

```hcl
module "kubernetes" {
  source = "./stackit-verified-modules/terraform-stackit-kubernetes"

  project_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  clusters = {
    production = {
      node_pools = [
        {
          name                    = "system"
          machine_type            = "c1.3"
          minimum                 = 2
          maximum                 = 3
          availability_zones      = ["eu01-1","eu01-2"]
          allow_system_components = true
        },
        {
          name               = "application"
          machine_type       = "c1.3"
          minimum            = 2
          maximum            = 5
          availability_zones = ["eu01-1","eu01-2"]
        }
      ]
    }

    staging = {
      node_pools = [
        {
          name                    = "system"
          machine_type            = "c1.2"
          minimum                 = 1
          maximum                 = 2
          availability_zones      = ["eu01-1","eu01-2"]
          allow_system_components = true
        },
        {
          name               = "application"
          machine_type       = "c1.2"
          minimum            = 1
          maximum            = 3
          availability_zones = ["eu01-1","eu01-2"]
        }
      ]
      maintenance = {
        start = "02:00:00Z"
        end   = "03:00:00Z"
      }
      hibernations = [
        {
          start    = "0 20 * * *"
          end      = "0 6 * * 1-5"
          timezone = "Europe/Berlin"
        }
      ]
    }
  }
}
```

## Defaults

| Attribute | Default |
|---|---|
| `maintenance.enable_kubernetes_version_updates` | `true` |
| `maintenance.enable_machine_image_version_updates` | `true` |
| `maintenance.start` | `"01:00:00Z"` |
| `maintenance.end` | `"02:00:00Z"` |
| `network.control_plane.access_scope` | `"PUBLIC"` |

All node pool optional attributes (`cri`, `os_name`, `volume_size`, `volume_type`) default to the provider's built-in defaults when not specified.

## Inputs

| Name | Description | Type | Required |
|---|---|---|---|
| `project_id` | STACKIT project ID to which the clusters are associated. | `string` | yes |
| `clusters` | Map of SKE cluster configurations. The map key is used as the cluster name. | `map(object({...}))` | yes |

## Outputs

| Name | Description |
|---|---|
| `clusters` | Map of created SKE clusters with their key attributes (id, name, kubernetes_version_used, egress_address_ranges, pod_address_ranges). |
