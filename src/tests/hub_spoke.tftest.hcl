variables {
  owner_email     = "example@digits.schwarz"
  company_name    = "Test Corp"
  company_code    = "tst"
  organization_id = "b76b54b6-f55d-41a1-b3c3-30252f8b97cc"
  region          = "eu01"

  labels = {
    managed_by  = "opentofu"
    environment = "test"
  }

  rm_folders = {
    platform = {
      name          = "Platform - TST"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_corporate = {
      name          = "Landing Zones - Corporate - TST"
      owner_emails  = []
      reader_emails = []
    }
    landing_zones_public = {
      name          = "Landing Zones - Public - TST"
      owner_emails  = []
      reader_emails = []
    }
    sandboxes = {
      name          = "Sandboxes - TST"
      owner_emails  = []
      reader_emails = []
    }
  }

  devops = {
    git_flavor             = "git-10"
    allowed_network_ranges = ["0.0.0.0/0"]
  }

  platform_kubernetes = {
    "eu01" = {
      region = "eu01"
      network = {
        mode = "sna"
      }
      dns = {
        enabled = true
        zones   = ["apps.test-corp.stackit.run"]
      }
      observability = {
        enabled = false
      }
      cluster = {
        name = "pltfmk8s"
        node_pools = [
          {
            name               = "small-a"
            machine_type       = "g3i.4"
            minimum            = 2
            maximum            = 2
            availability_zones = ["eu01-1"]
          },
          {
            name               = "small-b"
            machine_type       = "g3i.4"
            minimum            = 2
            maximum            = 2
            availability_zones = ["eu01-2"]
          }
        ]
      }
    }
  }

  connectivity = {
    dns_zones = {
      "test-corp" = {
        dns_name = "test-corp.stackit.run"
      }
    }
    network_area = {
      ranges                = ["10.0.0.0/16"]
      transfer_network      = "10.255.0.0/24"
      min_prefix_length     = 24
      max_prefix_length     = 28
      default_prefix_length = 25
    }
  }

  sandboxes = []

  landing_zones = {
    "test-corporate" = {
      project_name          = "Test Corporate LZ"
      project_code          = "tcorp"
      owner_email           = "example@digits.schwarz"
      env                   = "test"
      corporate             = true
      network_prefix_length = 25
      namespace_service = {
        enabled        = true
        namespace      = "tcorp-test"
        dns_subdomain  = "app"
        secretsmanager = true
      }
    }
    "test-public" = {
      project_name = "Test Public LZ"
      project_code = "tpub"
      owner_email  = "example@digits.schwarz"
      env          = "test"
      corporate    = false
    }
  }
}

# Validates hub-spoke without firewall: connectivity module is created, no firewall.
# Resource-computed outputs (network_area_id, project_id) are unknown during plan
# and cannot be asserted — a successful plan is the primary validation.
run "hub_spoke_plan" {
  command = plan

  assert {
    condition     = output.connectivity_firewall_public_ip == null
    error_message = "Firewall public IP must be null when no firewall is configured."
  }

  assert {
    condition     = length(output.platform_kubernetes_projects) == 1
    error_message = "Expected 1 platform Kubernetes project to be configured."
  }

  assert {
    condition     = output.platform_kubernetes_projects["eu01"].ske_cluster_region == "eu01"
    error_message = "Platform Kubernetes cluster region must be eu01."
  }

  assert {
    condition     = contains(output.platform_kubernetes_projects["eu01"].dns_extension_zones, "apps.test-corp.stackit.run")
    error_message = "Platform Kubernetes DNS extension must include apps.test-corp.stackit.run."
  }

  assert {
    condition     = length(output.landing_zone_projects) == 2
    error_message = "Expected 2 landing zones to be created."
  }

  assert {
    condition     = output.landing_zone_projects["test-corporate"].landing_zone_type == "corporate"
    error_message = "test-corporate must be a corporate landing zone."
  }

  assert {
    condition     = output.landing_zone_projects["test-public"].landing_zone_type == "public"
    error_message = "test-public must be a public landing zone."
  }

  assert {
    condition     = length(output.landing_zone_namespace_services) == 1
    error_message = "Expected 1 landing zone namespace service to be created."
  }

  assert {
    condition     = output.landing_zone_namespace_services["test-corporate"].namespace == "tcorp-test"
    error_message = "Expected namespace tcorp-test for test-corporate namespace service."
  }

  assert {
    condition     = output.landing_zone_namespace_service_requests["test-corporate"].dns_fqdn == "app.tcorp-test-eu01-test-corp.stackit.run"
    error_message = "Expected namespace-service DNS annotation app.tcorp-test-eu01-test-corp.stackit.run."
  }

  assert {
    condition     = length(output.landing_zone_namespace_users) == 1
    error_message = "Expected one namespace-scoped Kubernetes user for the enabled namespace service."
  }

  assert {
    condition     = output.landing_zone_namespace_users["test-corporate"].namespace == "tcorp-test"
    error_message = "Expected namespace-scoped Kubernetes user bound to namespace tcorp-test."
  }
}

run "secrets_enforcement_audit_plan" {
  command = plan

  variables {
    landing_zones = {
      "test-corporate" = {
        project_name          = "Test Corporate LZ"
        project_code          = "tcorp"
        owner_email           = "example@digits.schwarz"
        env                   = "test"
        corporate             = true
        network_prefix_length = 25
        namespace_service = {
          enabled        = true
          namespace      = "tcorp-test"
          dns_subdomain  = "app"
          secretsmanager = true
          secrets_enforcement = {
            enabled = false
            mode    = "audit"
          }
        }
      }
      "test-public" = {
        project_name = "Test Public LZ"
        project_code = "tpub"
        owner_email  = "example@digits.schwarz"
        env          = "test"
        corporate    = false
      }
    }
  }

  assert {
    condition     = output.landing_zone_namespace_secret_enforcement["test-corporate"].enabled == false
    error_message = "Expected secrets enforcement to remain disabled unless explicitly enabled for policy rollout."
  }

  assert {
    condition     = output.landing_zone_namespace_secret_enforcement["test-corporate"].mode == "audit"
    error_message = "Expected audit mode for secrets enforcement."
  }

  assert {
    condition     = length(output.landing_zone_namespace_secret_enforcement_policies) == 0
    error_message = "Expected no namespace policy objects while secrets enforcement is disabled."
  }
}

run "secrets_enforcement_strict_plan" {
  command = plan

  variables {
    landing_zones = {
      "test-corporate" = {
        project_name          = "Test Corporate LZ"
        project_code          = "tcorp"
        owner_email           = "example@digits.schwarz"
        env                   = "test"
        corporate             = true
        network_prefix_length = 25
        namespace_service = {
          enabled        = true
          namespace      = "tcorp-test"
          dns_subdomain  = "app"
          secretsmanager = true
          secrets_enforcement = {
            enabled = false
            mode    = "strict"
          }
        }
      }
      "test-public" = {
        project_name = "Test Public LZ"
        project_code = "tpub"
        owner_email  = "example@digits.schwarz"
        env          = "test"
        corporate    = false
      }
    }
  }

  assert {
    condition     = output.landing_zone_namespace_secret_enforcement["test-corporate"].mode == "strict"
    error_message = "Expected strict mode for secrets enforcement."
  }

  assert {
    condition     = length(output.landing_zone_namespace_secret_enforcement_policies) == 0
    error_message = "Expected no namespace policy objects while secrets enforcement is disabled."
  }
}
