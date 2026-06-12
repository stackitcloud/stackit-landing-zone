#############
## OUTPUTS ##
#############

output "governance_folder_ids" {
  description = "Map of governance folder names to their container IDs."
  value       = module.governance.folder_container_ids
}

output "devops_project_id" {
  description = "The project ID of the DevOps project."
  value       = length(module.devops) > 0 ? module.devops[0].project_id : null
}

output "management_project_id" {
  description = "The project ID of the Management project."
  value       = module.management.project_id
}

output "management_bucket_name_tfstate" {
  description = "The name of the Management tfstate object storage bucket."
  value       = module.management.bucket_name_tfstate
}

output "connectivity_network_area_id" {
  description = "The network area ID created by the regional module."
  value       = try(module.connectivity[0].network_area_id, null)
}

output "connectivity_project_id" {
  description = "The project ID of the connectivity project."
  value       = try(module.connectivity[0].project_id, null)
}

output "connectivity_firewall_public_ip" {
  description = "The public IP of the firewall."
  value       = try(module.connectivity[0].firewall_public_ip, null)
}

output "platform_kubernetes_projects" {
  description = "Map of platform Kubernetes projects and cluster metadata per key."
  value = {
    for k, v in module.platform_kubernetes : k => {
      project_id                = v.project_id
      project_name              = v.project_name
      ske_cluster_name          = v.ske_cluster_name
      ske_cluster_region        = v.ske_cluster_region
      observability_instance_id = v.observability_instance_id
      encrypted_volume_support  = v.encrypted_volume_support
      debug_bastion             = v.debug_bastion
      dns_extension_zones       = v.dns_extension_zones
    }
  }
}

output "sandbox_projects" {
  description = "The created sandbox projects."
  value       = length(module.sandboxes) > 0 ? module.sandboxes[0].projects : {}
}

output "landing_zone_projects" {
  description = "Map of landing zone project IDs."
  value = {
    for k, v in module.landing_zone : k => {
      project_id                     = v.project_id
      project_name                   = v.project_name
      dns_zone_name                  = v.dns_zone_dns_name
      secretsmanager_instance_id     = v.secretsmanager_instance_id
      observability_instance_id      = v.observability_instance_id
      observability_grafana_url      = v.observability_grafana_url
      observability_grafana_user     = v.observability_grafana_admin_user
      observability_metrics_push_url = v.observability_metrics_push_url
      landing_zone_type              = v.landing_zone_type
      connected_network_area_id      = v.connected_network_area_id == null ? "" : v.connected_network_area_id
    }
  }
}

output "landing_zone_observability_access" {
  description = "Sensitive Grafana access data for landing zone observability instances."
  sensitive   = true
  value = {
    for k, v in module.landing_zone : k => {
      grafana_url            = v.observability_grafana_url
      grafana_admin_user     = v.observability_grafana_admin_user
      grafana_admin_password = v.observability_grafana_admin_password
    }
  }
}

output "landing_zone_namespace_services" {
  description = "Map of created landing zone namespace services in the central platform Kubernetes cluster."
  value = {
    for k, v in kubernetes_namespace_v1.landing_zone : k => {
      namespace   = v.metadata[0].name
      labels      = v.metadata[0].labels
      annotations = v.metadata[0].annotations
    }
  }
}

output "landing_zone_namespace_service_requests" {
  description = "Map of resolved landing zone namespace-service requests before Kubernetes apply-time metadata resolution."
  value = {
    for k, v in local.landing_zone_namespace_services : k => {
      namespace          = v.namespace
      dns_fqdn           = v.dns_fqdn
      use_secretsmanager = v.use_secretsmanager
      secrets_enforcement = {
        enabled       = v.secrets_enforcement.enabled
        mode          = v.secrets_enforcement.mode
        policy_engine = "kyverno"
      }
    }
  }
}

output "landing_zone_namespace_secret_enforcement" {
  description = "Map of resolved secret-enforcement settings per enabled landing zone namespace service."
  value = {
    for k, v in local.landing_zone_namespace_services : k => {
      enabled                   = v.secrets_enforcement.enabled
      mode                      = v.secrets_enforcement.mode
      policy_engine             = "kyverno"
      allow_opaque_secret_types = v.secrets_enforcement.allow_opaque_secret_types
      break_glass               = v.secrets_enforcement.break_glass
    }
  }
}

output "landing_zone_namespace_secret_enforcement_policies" {
  description = "Map of created namespace-level secret-enforcement policy objects."
  value = {
    for k, v in kubernetes_manifest.landing_zone_secret_enforcement_policy : k => {
      name      = v.manifest.metadata.name
      namespace = v.manifest.metadata.namespace
      engine    = "kyverno"
      mode      = local.landing_zone_namespace_services[k].secrets_enforcement.mode
    }
  }
}

output "landing_zone_namespace_users" {
  description = "Map of namespace-scoped Kubernetes access identities for enabled landing zone namespace services."
  value = {
    for k, v in kubernetes_service_account_v1.landing_zone_user : k => {
      namespace            = v.metadata[0].namespace
      service_account_name = v.metadata[0].name
      role_name            = kubernetes_role_v1.landing_zone_user[k].metadata[0].name
      role_binding_name    = kubernetes_role_binding_v1.landing_zone_user[k].metadata[0].name
      token_secret_name    = kubernetes_secret_v1.landing_zone_user_token[k].metadata[0].name
    }
  }
}

output "landing_zone_namespace_user_kubeconfigs" {
  description = "Map of namespace-scoped kubeconfigs for landing zone namespace users."
  sensitive   = true
  value = {
    for k, v in kubernetes_service_account_v1.landing_zone_user : k => yamlencode({
      apiVersion = "v1"
      kind       = "Config"
      clusters = [{
        name = "platform"
        cluster = {
          server                     = yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster.server
          certificate-authority-data = yamldecode(local.platform_kubernetes_kube_config).clusters[0].cluster["certificate-authority-data"]
        }
      }]
      users = [{
        name = v.metadata[0].name
        user = {
          token = lookup(kubernetes_secret_v1.landing_zone_user_token[k].data, "token", null)
        }
      }]
      contexts = [{
        name = "${v.metadata[0].name}@platform"
        context = {
          cluster   = "platform"
          user      = v.metadata[0].name
          namespace = v.metadata[0].namespace
        }
      }]
      current-context = "${v.metadata[0].name}@platform"
    })
  }
}

output "landing_zone_namespace_sample_load" {
  description = "Map of optional namespace sample-load pods that mount the namespace user token secret."
  value = {
    for k, v in kubernetes_pod_v1.landing_zone_sample_load : k => {
      namespace           = v.metadata[0].namespace
      pod_name            = v.metadata[0].name
      mounted_secret_name = kubernetes_secret_v1.landing_zone_user_token[k].metadata[0].name
      phase               = try(v.status[0].phase, null)
    }
  }
}

output "landing_zone_namespace_demo_samples" {
  description = "Map of optional end-to-end demo resources for namespace services (external secret, service, ingress, dashboard example)."
  value = {
    for k, v in kubernetes_deployment_v1.landing_zone_demo_app : k => {
      namespace              = v.metadata[0].namespace
      deployment_name        = v.metadata[0].name
      service_name           = kubernetes_service_v1.landing_zone_demo_app[k].metadata[0].name
      ingress_name           = kubernetes_ingress_v1.landing_zone_demo_app[k].metadata[0].name
      ingress_host           = local.landing_zone_namespace_services[k].demo.ingress_host
      external_secret_name   = contains(keys(kubernetes_manifest.landing_zone_demo_external_secret), k) ? kubernetes_manifest.landing_zone_demo_external_secret[k].manifest.metadata.name : null
      target_secret_name     = contains(keys(kubernetes_manifest.landing_zone_demo_external_secret), k) ? kubernetes_manifest.landing_zone_demo_external_secret[k].manifest.spec.target.name : null
      dashboard_configmap    = contains(keys(kubernetes_config_map_v1.landing_zone_demo_dashboard_example), k) ? kubernetes_config_map_v1.landing_zone_demo_dashboard_example[k].metadata[0].name : null
      observability_instance = module.landing_zone[k].observability_instance_id
    }
  }
}
