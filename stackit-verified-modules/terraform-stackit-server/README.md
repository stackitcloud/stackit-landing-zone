# terraform-stackit-server

Terraform module for managing STACKIT IaaS servers with optional key pairs, boot volumes, additional volumes, and network interfaces.

## Usage

### Basic server with boot volume from image

```hcl
module "servers" {
  source = "./stackit-verified-modules/terraform-stackit-server"

  project_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  key_pairs = {
    deploy = {
      public_key = file("~/.ssh/id_rsa.pub")
    }
  }

  servers = {
    web = {
      machine_type      = "g2i.1"
      availability_zone = "eu01-1"
      keypair_name      = "deploy"
      boot_volume = {
        source_type = "image"
        source_id   = "59838a89-51b1-4892-b57f-b3caf598ee2f" // Ubuntu 24.04
        size        = 64
      }
    }
  }
}
```

### Boot from existing volume

```hcl
module "servers" {
  source = "./stackit-verified-modules/terraform-stackit-server"

  project_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  servers = {
    database = {
      machine_type      = "g2i.2"
      availability_zone = "eu01-1"
      boot_volume = {
        source_type = "volume"
        source_id   = "existing-volume-id"
      }
    }
  }
}
```

### Server with cloud-init, network, and additional volumes

```hcl
module "servers" {
  source = "./stackit-verified-modules/terraform-stackit-server"

  project_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  key_pairs = {
    deploy = {
      public_key = file("~/.ssh/id_rsa.pub")
    }
  }

  servers = {
    app = {
      machine_type      = "g2i.2"
      availability_zone = "eu01-1"
      keypair_name      = "deploy"
      user_data         = file("${path.module}/cloud-init.yaml")
      labels            = { environment = "production", team = "platform" }
      boot_volume = {
        source_type           = "image"
        source_id             = "59838a89-51b1-4892-b57f-b3caf598ee2f"
        size                  = 64
        delete_on_termination = true
      }
      network_interface_ids = [stackit_network_interface.app.network_interface_id]
      volumes = {
        data = {
          size              = 100
          performance_class = "storage_premium_perf6"
        }
        logs = {
          size              = 50
          performance_class = "storage_premium_perf1"
        }
      }
    }
  }
}
```

### Multiple servers with shared configuration

```hcl
module "servers" {
  source = "./stackit-verified-modules/terraform-stackit-server"

  project_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  servers = {
    web-1 = {
      machine_type      = "g2i.1"
      availability_zone = "eu01-1"
      affinity_group    = "web-group-id"
      keypair_name      = "deploy"
      boot_volume = {
        source_type = "image"
        source_id   = "59838a89-51b1-4892-b57f-b3caf598ee2f"
        size        = 64
      }
      network_interface_ids = [stackit_network_interface.web1.network_interface_id]
    }

    web-2 = {
      machine_type      = "g2i.1"
      availability_zone = "eu01-2"
      affinity_group    = "web-group-id"
      keypair_name      = "deploy"
      boot_volume = {
        source_type = "image"
        source_id   = "59838a89-51b1-4892-b57f-b3caf598ee2f"
        size        = 64
      }
      network_interface_ids = [stackit_network_interface.web2.network_interface_id]
    }
  }
}
```

## Inputs

| Name | Description | Type | Required |
|---|---|---|---|
| `project_id` | STACKIT project ID to which the servers are associated. | `string` | yes |
| `servers` | Map of server configurations. The map key is used as the server name. | `map(object({...}))` | yes |
| `key_pairs` | Map of SSH key pairs to create. The map key is used as the key pair name. | `map(object({...}))` | no |

## Outputs

| Name | Description |
|---|---|
| `key_pairs` | Map of created SSH key pairs. |
| `servers` | Map of created servers (id, server_id, name, created_at). |
| `volumes` | Map of created additional volumes with their attachments. |
