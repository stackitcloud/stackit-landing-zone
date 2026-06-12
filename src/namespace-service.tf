#############################
## LANDING ZONE NAMESPACES ##
#############################

locals {
  secrets_enforcement_default_exempt_principals = [
    "system:serviceaccount:external-secrets:external-secrets",
    "system:serviceaccount:external-secrets:external-secrets-operator",
  ]

  landing_zone_namespace_services = {
    for key, value in var.landing_zones : key => {
      namespace                = value.namespace_service.namespace != null ? value.namespace_service.namespace : trim(replace(lower(replace("${value.project_code}-${value.env}", "/[^a-zA-Z0-9-]/", "-")), "/-{2,}/", "-"), "-")
      dns_subdomain            = value.namespace_service.dns_subdomain
      dns_fqdn                 = value.namespace_service.dns_subdomain != null && try(module.landing_zone[key].dns_zone_dns_name, null) != null ? "${value.namespace_service.dns_subdomain}.${module.landing_zone[key].dns_zone_dns_name}" : null
      service_account_name     = value.namespace_service.kubernetes_access.service_account_name != null ? value.namespace_service.kubernetes_access.service_account_name : trim(replace(lower(replace("${value.project_code}-${value.env}-ns-user", "/[^a-zA-Z0-9-]/", "-")), "/-{2,}/", "-"), "-")
      enable_kubernetes_access = value.namespace_service.kubernetes_access.enabled
      sample_load = {
        enabled = value.namespace_service.sample_load.enabled
        image   = value.namespace_service.sample_load.image
      }
      demo = {
        enabled                    = value.namespace_service.demo.enabled
        image                      = value.namespace_service.demo.image
        ingress_class_name         = value.namespace_service.demo.ingress_class_name
        install_ingress_controller = value.namespace_service.demo.install_ingress_controller
        external_secret_enabled    = value.namespace_service.demo.external_secret_enabled
        dashboard_example_enabled  = value.namespace_service.demo.dashboard_example_enabled
        ingress_host               = local.platform_kubernetes_cluster_key != null && length(module.platform_kubernetes[local.platform_kubernetes_cluster_key].dns_extension_zones) > 0 ? "${key}.${module.platform_kubernetes[local.platform_kubernetes_cluster_key].dns_extension_zones[0]}" : null
      }
      labels             = value.namespace_service.labels
      annotations        = value.namespace_service.annotations
      use_secretsmanager = value.namespace_service.secretsmanager
      secrets_enforcement = {
        enabled                   = value.namespace_service.secrets_enforcement.enabled
        mode                      = lower(value.namespace_service.secrets_enforcement.mode)
        allow_opaque_secret_types = value.namespace_service.secrets_enforcement.allow_opaque_secret_types
        break_glass = {
          enabled    = value.namespace_service.secrets_enforcement.break_glass.enabled
          ttl_hours  = value.namespace_service.secrets_enforcement.break_glass.ttl_hours
          principals = value.namespace_service.secrets_enforcement.break_glass.principals
        }
      }
    }
    if value.namespace_service.enabled
  }

  landing_zone_namespace_services_kyverno = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.secrets_enforcement.enabled
  }

  landing_zone_namespace_services_demo = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.demo.enabled
  }

  landing_zone_namespace_services_demo_external_secret = {
    for key, value in local.landing_zone_namespace_services_demo : key => value
    if value.demo.external_secret_enabled
  }

  landing_zone_namespace_services_demo_observability = {
    for key, value in local.landing_zone_namespace_services_demo : key => value
    if value.demo.dashboard_example_enabled && try(module.landing_zone[key].observability_metrics_push_url, null) != null
  }
}

check "landing_zone_namespace_services_unique_namespaces" {
  assert {
    condition     = length(local.landing_zone_namespace_services) == length(distinct([for svc in values(local.landing_zone_namespace_services) : svc.namespace]))
    error_message = "Each enabled namespace_service must resolve to a unique namespace name."
  }
}

check "landing_zone_namespace_services_non_empty_namespaces" {
  assert {
    condition     = alltrue([for svc in values(local.landing_zone_namespace_services) : length(svc.namespace) > 0])
    error_message = "Each enabled namespace_service must resolve to a non-empty namespace name."
  }
}

check "landing_zone_namespace_services_demo_requires_dns" {
  assert {
    condition     = alltrue([for svc in values(local.landing_zone_namespace_services) : !svc.demo.enabled || svc.demo.ingress_host != null])
    error_message = "namespace_service.demo.enabled requires one platform_kubernetes.dns.zones entry for external DNS management."
  }
}

check "landing_zone_namespace_services_demo_dashboard_requires_observability" {
  assert {
    condition     = alltrue([for key, svc in local.landing_zone_namespace_services : !svc.demo.dashboard_example_enabled || try(module.landing_zone[key].observability_grafana_url, null) != null])
    error_message = "namespace_service.demo.dashboard_example_enabled requires landing_zones.<key>.observability.enabled=true."
  }
}

check "landing_zone_namespace_services_demo_external_secret_requires_sm" {
  assert {
    condition     = alltrue([for svc in values(local.landing_zone_namespace_services) : !svc.demo.external_secret_enabled || svc.use_secretsmanager])
    error_message = "namespace_service.demo.external_secret_enabled requires namespace_service.secretsmanager=true."
  }
}

resource "helm_release" "kyverno" {
  provider = helm.platform
  count    = length(local.landing_zone_namespace_services_kyverno) > 0 ? 1 : 0

  name             = "kyverno"
  namespace        = "kyverno"
  repository       = "https://kyverno.github.io/kyverno/"
  chart            = "kyverno"
  create_namespace = true
  wait             = true
  timeout          = 600
  atomic           = true
  cleanup_on_fail  = true
}

resource "helm_release" "external_secrets" {
  provider = helm.platform
  count    = length(local.landing_zone_namespace_services_demo_external_secret) > 0 ? 1 : 0

  name             = "external-secrets"
  namespace        = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  create_namespace = true
  wait             = true
  timeout          = 600
  atomic           = true
  cleanup_on_fail  = true
}

resource "helm_release" "demo_ingress_nginx" {
  provider = helm.platform
  count    = length([for svc in values(local.landing_zone_namespace_services_demo) : svc if svc.demo.install_ingress_controller]) > 0 ? 1 : 0

  name             = "lz-demo-ingress-nginx"
  namespace        = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  create_namespace = true
  wait             = true
  timeout          = 600
  atomic           = true
  cleanup_on_fail  = true

  set = [
    {
      name  = "controller.ingressClass"
      value = "lz-demo"
    },
    {
      name  = "controller.ingressClassResource.name"
      value = "lz-demo"
    },
    {
      name  = "controller.ingressClassResource.controllerValue"
      value = "k8s.io/ingress-nginx-lz-demo"
    },
    {
      name  = "controller.ingressClassByName"
      value = "true"
    },
    {
      name  = "controller.watchIngressWithoutClass"
      value = "false"
    },
    {
      name  = "controller.service.type"
      value = "LoadBalancer"
    },
  ]
}

resource "kubernetes_service_account_v1" "landing_zone_demo_kube_state_metrics" {
  provider = kubernetes.platform
  count    = length(local.landing_zone_namespace_services_demo_observability) > 0 ? 1 : 0

  metadata {
    name      = "lz-demo-kube-state-metrics"
    namespace = "external-secrets"
    labels = {
      "stackit.cloud/demo" = "true"
    }
  }
}

resource "kubernetes_cluster_role_v1" "landing_zone_demo_kube_state_metrics" {
  provider = kubernetes.platform
  count    = length(local.landing_zone_namespace_services_demo_observability) > 0 ? 1 : 0

  metadata {
    name = "lz-demo-kube-state-metrics"
    labels = {
      "stackit.cloud/demo" = "true"
    }
  }

  rule {
    api_groups = [""]
    resources  = ["pods", "services", "endpoints", "persistentvolumeclaims", "persistentvolumes", "nodes", "namespaces", "resourcequotas", "limitranges", "secrets", "configmaps", "serviceaccounts"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "daemonsets", "statefulsets", "replicasets"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = ["batch"]
    resources  = ["jobs", "cronjobs"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses", "networkpolicies"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = ["storage.k8s.io"]
    resources  = ["storageclasses", "volumeattachments"]
    verbs      = ["list", "watch"]
  }
}

resource "kubernetes_cluster_role_binding_v1" "landing_zone_demo_kube_state_metrics" {
  provider = kubernetes.platform
  count    = length(local.landing_zone_namespace_services_demo_observability) > 0 ? 1 : 0

  metadata {
    name = "lz-demo-kube-state-metrics"
    labels = {
      "stackit.cloud/demo" = "true"
    }
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role_v1.landing_zone_demo_kube_state_metrics[0].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account_v1.landing_zone_demo_kube_state_metrics[0].metadata[0].name
    namespace = kubernetes_service_account_v1.landing_zone_demo_kube_state_metrics[0].metadata[0].namespace
  }
}

resource "kubernetes_deployment_v1" "landing_zone_demo_kube_state_metrics" {
  provider = kubernetes.platform
  count    = length(local.landing_zone_namespace_services_demo_observability) > 0 ? 1 : 0

  metadata {
    name      = "lz-demo-kube-state-metrics"
    namespace = "external-secrets"
    labels = {
      "app.kubernetes.io/name" = "lz-demo-kube-state-metrics"
      "stackit.cloud/demo"     = "true"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "lz-demo-kube-state-metrics"
      }
    }

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name" = "lz-demo-kube-state-metrics"
        }
      }

      spec {
        service_account_name = kubernetes_service_account_v1.landing_zone_demo_kube_state_metrics[0].metadata[0].name

        container {
          name  = "kube-state-metrics"
          image = "registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.13.0"

          args = [
            "--port=8080",
            "--telemetry-port=8081",
          ]

          port {
            name           = "http-metrics"
            container_port = 8080
          }

          port {
            name           = "telemetry"
            container_port = 8081
          }

          readiness_probe {
            http_get {
              path = "/readyz"
              port = "telemetry"
            }
            initial_delay_seconds = 15
            timeout_seconds       = 5
          }

          liveness_probe {
            http_get {
              path = "/livez"
              port = "telemetry"
            }
            initial_delay_seconds = 20
            timeout_seconds       = 5
          }
        }
      }
    }
  }

  depends_on = [
    kubernetes_cluster_role_binding_v1.landing_zone_demo_kube_state_metrics,
  ]
}

resource "kubernetes_service_v1" "landing_zone_demo_kube_state_metrics" {
  provider = kubernetes.platform
  count    = length(local.landing_zone_namespace_services_demo_observability) > 0 ? 1 : 0

  metadata {
    name      = "lz-demo-kube-state-metrics"
    namespace = "external-secrets"
    labels = {
      "app.kubernetes.io/name" = "lz-demo-kube-state-metrics"
      "stackit.cloud/demo"     = "true"
    }
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "lz-demo-kube-state-metrics"
    }

    port {
      name        = "http-metrics"
      port        = 8080
      target_port = "http-metrics"
      protocol    = "TCP"
    }
  }

  depends_on = [
    kubernetes_deployment_v1.landing_zone_demo_kube_state_metrics,
  ]
}

resource "stackit_secretsmanager_user" "landing_zone_demo_external_secret" {
  for_each = local.landing_zone_namespace_services_demo_external_secret

  project_id    = module.landing_zone[each.key].project_id
  instance_id   = module.landing_zone[each.key].secretsmanager_instance_id
  description   = "Demo ExternalSecret reader for ${each.key}"
  write_enabled = true
}

resource "stackit_observability_credential" "landing_zone_demo_metrics_remote_write" {
  for_each = local.landing_zone_namespace_services_demo_observability

  project_id  = module.landing_zone[each.key].project_id
  instance_id = module.landing_zone[each.key].observability_instance_id
  description = "Demo remote-write credential for ${each.key}"
}

resource "kubernetes_secret_v1" "landing_zone_demo_vault_auth" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo_external_secret

  metadata {
    name      = "${each.key}-demo-vault-auth"
    namespace = "external-secrets"
    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/demo"         = "true"
    }
  }

  data = {
    password = stackit_secretsmanager_user.landing_zone_demo_external_secret[each.key].password
  }

  type = "Opaque"

  depends_on = [
    helm_release.external_secrets,
    stackit_secretsmanager_user.landing_zone_demo_external_secret,
  ]
}

resource "kubernetes_manifest" "landing_zone_demo_secret_store" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo_external_secret

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ClusterSecretStore"
    metadata = {
      name = "${each.key}-stackit-sm-store"
      labels = {
        "stackit.cloud/landing-zone" = each.key
        "stackit.cloud/demo"         = "true"
      }
    }
    spec = {
      provider = {
        vault = {
          server  = "https://prod.sm.${var.region}.stackit.cloud"
          path    = module.landing_zone[each.key].secretsmanager_instance_id
          version = "v2"
          auth = {
            userPass = {
              path     = "userpass"
              username = stackit_secretsmanager_user.landing_zone_demo_external_secret[each.key].username
              secretRef = {
                name      = kubernetes_secret_v1.landing_zone_demo_vault_auth[each.key].metadata[0].name
                key       = "password"
                namespace = "external-secrets"
              }
            }
          }
        }
      }
    }
  }

  computed_fields = [
    "metadata",
    "spec",
    "status",
  ]

  depends_on = [
    helm_release.external_secrets,
    kubernetes_secret_v1.landing_zone_demo_vault_auth,
    stackit_secretsmanager_user.landing_zone_demo_external_secret,
  ]
}

resource "kubernetes_manifest" "landing_zone_demo_external_secret" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo_external_secret

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "${each.key}-demo-app-secret"
      namespace = each.value.namespace
      labels = {
        "stackit.cloud/landing-zone" = each.key
        "stackit.cloud/demo"         = "true"
      }
    }
    spec = {
      refreshInterval = "1m"
      secretStoreRef = {
        name = kubernetes_manifest.landing_zone_demo_secret_store[each.key].manifest.metadata.name
        kind = "ClusterSecretStore"
      }
      target = {
        name           = "${each.key}-demo-app-secret"
        creationPolicy = "Owner"
      }
      data = [{
        secretKey = "APP_MESSAGE"
        remoteRef = {
          key      = "namespace-demo/${each.key}/app"
          property = "APP_MESSAGE"
        }
      }]
    }
  }

  computed_fields = [
    "metadata",
    "spec",
    "status",
  ]

  depends_on = [
    kubernetes_manifest.landing_zone_demo_secret_store,
    kubernetes_namespace_v1.landing_zone,
  ]
}

resource "kubernetes_deployment_v1" "landing_zone_demo_app" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo

  metadata {
    name      = "${each.key}-demo-app"
    namespace = each.value.namespace
    labels = {
      "app.kubernetes.io/name"       = "${each.key}-demo-app"
      "stackit.cloud/landing-zone"   = each.key
      "stackit.cloud/demo-scenario"  = "namespace-service"
      "stackit.cloud/demo-component" = "workload"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "${each.key}-demo-app"
      }
    }

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"       = "${each.key}-demo-app"
          "stackit.cloud/landing-zone"   = each.key
          "stackit.cloud/demo-scenario"  = "namespace-service"
          "stackit.cloud/demo-component" = "workload"
        }
      }

      spec {
        container {
          name  = "app"
          image = each.value.demo.image
          args  = ["-listen=:5678", "-text=STACKIT Landing Zone Demo"]

          port {
            container_port = 5678
          }

          env {
            name = "APP_MESSAGE"

            value_from {
              secret_key_ref {
                name     = "${each.key}-demo-app-secret"
                key      = "APP_MESSAGE"
                optional = true
              }
            }
          }
        }
      }
    }
  }

  depends_on = [
    kubernetes_manifest.landing_zone_demo_external_secret,
  ]
}

resource "kubernetes_service_v1" "landing_zone_demo_app" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo

  metadata {
    name      = "${each.key}-demo-app"
    namespace = each.value.namespace
    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/demo"         = "true"
    }
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "${each.key}-demo-app"
    }

    port {
      port        = 80
      target_port = 5678
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_ingress_v1" "landing_zone_demo_app" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo

  metadata {
    name      = "${each.key}-demo-app"
    namespace = each.value.namespace
    annotations = {
      "external-dns.alpha.kubernetes.io/hostname" = each.value.demo.ingress_host
      "stackit.cloud/demo"                        = "true"
      "kubernetes.io/ingress.class"               = each.value.demo.ingress_class_name
    }
  }

  spec {
    ingress_class_name = each.value.demo.ingress_class_name

    rule {
      host = each.value.demo.ingress_host

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.landing_zone_demo_app[each.key].metadata[0].name

              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }

  depends_on = [
    helm_release.demo_ingress_nginx,
  ]
}

resource "kubernetes_config_map_v1" "landing_zone_demo_dashboard_example" {
  provider = kubernetes.platform

  for_each = {
    for key, value in local.landing_zone_namespace_services_demo : key => value
    if value.demo.dashboard_example_enabled
  }

  metadata {
    name      = "${each.key}-demo-dashboard-example"
    namespace = each.value.namespace
    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/demo"         = "true"
    }
  }

  data = {
    "grafana-dashboard.json" = local.landing_zone_demo_dashboard_json[each.key]
  }
}

resource "kubernetes_config_map_v1" "landing_zone_demo_metrics_agent_config" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo_observability

  metadata {
    name      = "${each.key}-demo-metrics-agent-config"
    namespace = each.value.namespace
    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/demo"         = "true"
    }
  }

  data = {
    "prometheus.yml" = <<-EOT
      global:
        scrape_interval: 30s
      scrape_configs:
        - job_name: lz-demo-kube-state-metrics
          static_configs:
            - targets:
                - lz-demo-kube-state-metrics.external-secrets.svc.cluster.local:8080
          metric_relabel_configs:
            - source_labels: [namespace]
              regex: ${each.value.namespace}
              action: keep
      remote_write:
        - url: ${module.landing_zone[each.key].observability_metrics_push_url}
          basic_auth:
            username: ${stackit_observability_credential.landing_zone_demo_metrics_remote_write[each.key].username}
            password: ${stackit_observability_credential.landing_zone_demo_metrics_remote_write[each.key].password}
    EOT
  }

  depends_on = [
    kubernetes_service_v1.landing_zone_demo_kube_state_metrics,
    stackit_observability_credential.landing_zone_demo_metrics_remote_write,
  ]
}

resource "kubernetes_deployment_v1" "landing_zone_demo_metrics_agent" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_demo_observability

  metadata {
    name      = "${each.key}-demo-metrics-agent"
    namespace = each.value.namespace
    labels = {
      "app.kubernetes.io/name"     = "${each.key}-demo-metrics-agent"
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/demo"         = "true"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "${each.key}-demo-metrics-agent"
      }
    }

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name" = "${each.key}-demo-metrics-agent"
        }
      }

      spec {
        container {
          name  = "prometheus-agent"
          image = "prom/prometheus:v2.54.1"
          args = [
            "--config.file=/etc/prometheus/prometheus.yml",
            "--enable-feature=agent",
            "--storage.agent.path=/prometheus",
          ]

          port {
            container_port = 9090
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/prometheus"
            read_only  = true
          }
        }

        volume {
          name = "config"

          config_map {
            name = kubernetes_config_map_v1.landing_zone_demo_metrics_agent_config[each.key].metadata[0].name
          }
        }
      }
    }
  }

  depends_on = [
    kubernetes_config_map_v1.landing_zone_demo_metrics_agent_config,
  ]
}

locals {
  landing_zone_demo_dashboard_json = {
    for key, value in local.landing_zone_namespace_services_demo : key => jsonencode({
      uid           = "lz-demo-${key}"
      title         = "Landing Zone Demo - ${value.namespace}"
      tags          = ["stackit", "landing-zone", "demo", value.namespace]
      schemaVersion = 39
      version       = 2
      editable      = true
      timezone      = "browser"
      refresh       = "30s"
      graphTooltip  = 1
      time = {
        from = "now-6h"
        to   = "now"
      }
      panels = [
        {
          id    = 1
          title = "Running Demo Pods"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 0
            y = 0
          }
          datasource = "Thanos"
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          fieldConfig = {
            defaults = {
              unit = "none"
              thresholds = {
                mode = "absolute"
                steps = [{
                  color = "green"
                  value = null
                }]
              }
            }
            overrides = []
          }
          targets = [{
            refId        = "A"
            legendFormat = "running demo pods"
            expr         = "sum(kube_pod_status_phase{namespace=\"${value.namespace}\",phase=\"Running\",pod=~\"${key}-demo-app-.*|${local.landing_zone_namespace_services[key].service_account_name}-sample-load.*\"} == 1)"
          }]
        },
        {
          id    = 2
          title = "Pods Running (All in Namespace)"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 6
            y = 0
          }
          datasource = "Thanos"
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          fieldConfig = {
            defaults = {
              unit = "none"
              thresholds = {
                mode = "absolute"
                steps = [{
                  color = "blue"
                  value = null
                }]
              }
            }
            overrides = []
          }
          targets = [{
            refId        = "A"
            legendFormat = "running pods"
            expr         = "sum(kube_pod_status_phase{namespace=\"${value.namespace}\",phase=\"Running\"} == 1)"
          }]
        },
        {
          id    = 3
          title = "Services in Namespace"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 12
            y = 0
          }
          datasource = "Thanos"
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          fieldConfig = {
            defaults = {
              unit = "none"
              thresholds = {
                mode = "absolute"
                steps = [{
                  color = "green"
                  value = null
                }]
              }
            }
            overrides = []
          }
          targets = [{
            refId        = "A"
            legendFormat = "services"
            expr         = "count(kube_service_info{namespace=\"${value.namespace}\"})"
          }]
        },
        {
          id    = 4
          title = "Ready Containers"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 0
            y = 5
          }
          datasource = "Thanos"
          fieldConfig = {
            defaults = {
              unit = "none"
            }
            overrides = []
          }
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          targets = [{
            refId        = "A"
            legendFormat = "ready containers"
            expr         = "sum(kube_pod_container_status_ready{namespace=\"${value.namespace}\"} == 1)"
          }]
        },
        {
          id    = 5
          title = "Available Deployment Replicas"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 6
            y = 5
          }
          datasource = "Thanos"
          fieldConfig = {
            defaults = {
              unit = "none"
            }
            overrides = []
          }
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          targets = [{
            refId        = "A"
            legendFormat = "available replicas"
            expr         = "sum(kube_deployment_status_replicas_available{namespace=\"${value.namespace}\"})"
          }]
        },
        {
          id    = 6
          title = "Sample Load Pod Running"
          type  = "stat"
          gridPos = {
            h = 5
            w = 6
            x = 12
            y = 5
          }
          datasource = "Thanos"
          fieldConfig = {
            defaults = {
              unit = "none"
            }
            overrides = []
          }
          options = {
            colorMode   = "value"
            graphMode   = "none"
            justifyMode = "auto"
            reduceOptions = {
              calcs  = ["lastNotNull"]
              fields = ""
              values = false
            }
            textMode = "auto"
          }
          targets = [{
            refId        = "A"
            legendFormat = "sample load running"
            expr         = "sum(kube_pod_status_phase{namespace=\"${value.namespace}\",phase=\"Running\",pod=~\"${local.landing_zone_namespace_services[key].service_account_name}-sample-load.*\"} == 1)"
          }]
        },
        {
          id    = 7
          title = "Namespace Pods by Phase"
          type  = "timeseries"
          gridPos = {
            h = 8
            w = 24
            x = 0
            y = 10
          }
          datasource = "Thanos"
          fieldConfig = {
            defaults = {
              unit = "none"
            }
            overrides = []
          }
          options = {
            legend = {
              displayMode = "list"
              placement   = "bottom"
            }
            tooltip = {
              mode = "multi"
            }
          }
          targets = [{
            refId        = "A"
            legendFormat = "{{phase}}"
            expr         = "sum by (phase) (kube_pod_status_phase{namespace=\"${value.namespace}\"} == 1)"
          }]
        }
      ]
    })
  }
}

resource "null_resource" "landing_zone_demo_grafana_dashboard" {
  for_each = {
    for key, value in local.landing_zone_namespace_services_demo : key => value
    if value.demo.dashboard_example_enabled && try(module.landing_zone[key].observability_grafana_url, null) != null
  }

  triggers = {
    dashboard_sha = sha256(local.landing_zone_demo_dashboard_json[each.key])
    grafana_url   = module.landing_zone[each.key].observability_grafana_url
    namespace     = each.value.namespace
  }

  provisioner "local-exec" {
    command = <<-EOT
      cat <<PAYLOAD | curl --fail --silent --show-error \
        -u "$${GRAFANA_USER}:$${GRAFANA_PASSWORD}" \
        -H "Content-Type: application/json" \
        -X POST "$${GRAFANA_URL}/api/dashboards/db" \
        --data-binary @-
      {
        "dashboard": $${DASHBOARD_JSON},
        "overwrite": true
      }
      PAYLOAD
    EOT

    environment = {
      GRAFANA_URL      = module.landing_zone[each.key].observability_grafana_url
      GRAFANA_USER     = module.landing_zone[each.key].observability_grafana_admin_user
      GRAFANA_PASSWORD = module.landing_zone[each.key].observability_grafana_admin_password
      DASHBOARD_JSON   = local.landing_zone_demo_dashboard_json[each.key]
    }
  }

  depends_on = [
    kubernetes_config_map_v1.landing_zone_demo_dashboard_example,
  ]
}

resource "kubernetes_manifest" "landing_zone_secret_enforcement_policy" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services_kyverno

  manifest = {
    apiVersion = "kyverno.io/v1"
    kind       = "Policy"
    metadata = {
      name      = "stackit-secrets-enforcement"
      namespace = each.value.namespace
      labels = {
        "stackit.cloud/landing-zone" = each.key
      }
      annotations = {
        "stackit.cloud/secrets-enforcement-mode" = each.value.secrets_enforcement.mode
      }
    }
    spec = {
      validationFailureAction = each.value.secrets_enforcement.mode == "audit" ? "Audit" : "Enforce"
      background              = false
      rules = [
        {
          name = "deny-direct-secret-management"
          match = {
            any = [{
              resources = {
                kinds      = ["Secret"]
                operations = each.value.secrets_enforcement.mode == "strict" ? ["CREATE", "UPDATE"] : ["CREATE"]
              }
            }]
          }
          exclude = {
            any = [{
              subjects = [
                for principal in distinct(concat(
                  local.secrets_enforcement_default_exempt_principals,
                  each.value.secrets_enforcement.break_glass.enabled ? each.value.secrets_enforcement.break_glass.principals : []
                  )) : {
                  kind = "User"
                  name = principal
                }
              ]
            }]
          }
          validate = {
            message = "Direct Kubernetes Secret management is blocked. Use the approved Secrets Manager integration path."
            deny = {
              conditions = {
                all = [
                  {
                    key      = "{{ request.object.type || 'Opaque' }}"
                    operator = "AnyNotIn"
                    value    = each.value.secrets_enforcement.allow_opaque_secret_types
                  }
                ]
              }
            }
          }
        }
      ]
    }
  }

  computed_fields = [
    "metadata",
    "spec",
    "status",
  ]

  depends_on = [
    kubernetes_namespace_v1.landing_zone,
    helm_release.kyverno,
  ]
}

resource "kubernetes_namespace_v1" "landing_zone" {
  provider = kubernetes.platform

  for_each = local.landing_zone_namespace_services

  metadata {
    name = each.value.namespace

    labels = merge(
      {
        "stackit.cloud/landing-zone" = each.key
      },
      each.value.labels
    )

    annotations = merge(
      {
        "stackit.cloud/landing-zone-key" = each.key
      },
      each.value.dns_fqdn != null ? {
        "stackit.cloud/dns-fqdn" = each.value.dns_fqdn
      } : {},
      each.value.use_secretsmanager ? {
        "stackit.cloud/secretsmanager-instance-id" = module.landing_zone[each.key].secretsmanager_instance_id
      } : {},
      each.value.secrets_enforcement.enabled ? {
        "stackit.cloud/secrets-enforcement-enabled" = "true"
        "stackit.cloud/secrets-enforcement-mode"    = each.value.secrets_enforcement.mode
        "stackit.cloud/secrets-policy-engine"       = "kyverno"
      } : {},
      each.value.annotations
    )
  }

  lifecycle {
    precondition {
      condition     = local.platform_kubernetes_cluster_key != null
      error_message = "Namespace service requires one platform_kubernetes deployment in var.region."
    }

    precondition {
      condition     = each.value.dns_subdomain == null || try(module.landing_zone[each.key].dns_zone_dns_name, null) != null
      error_message = "namespace_service.dns_subdomain requires the landing zone to have a DNS zone."
    }
  }
}

resource "kubernetes_service_account_v1" "landing_zone_user" {
  provider = kubernetes.platform

  for_each = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.enable_kubernetes_access
  }

  metadata {
    name      = each.value.service_account_name
    namespace = kubernetes_namespace_v1.landing_zone[each.key].metadata[0].name

    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/access-scope" = "namespace"
    }
  }
}

resource "kubernetes_role_v1" "landing_zone_user" {
  provider = kubernetes.platform

  for_each = kubernetes_service_account_v1.landing_zone_user

  metadata {
    name      = "${each.value.metadata[0].name}-role"
    namespace = each.value.metadata[0].namespace
  }

  rule {
    api_groups = [""]
    resources  = ["pods", "pods/log", "services", "configmaps", "events", "serviceaccounts"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  dynamic "rule" {
    for_each = local.landing_zone_namespace_services[each.key].secrets_enforcement.enabled ? [] : [1]

    content {
      api_groups = [""]
      resources  = ["secrets"]
      verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
    }
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "replicasets", "statefulsets", "daemonsets"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  rule {
    api_groups = ["batch"]
    resources  = ["jobs", "cronjobs"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses", "networkpolicies"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }
}

resource "kubernetes_role_binding_v1" "landing_zone_user" {
  provider = kubernetes.platform

  for_each = kubernetes_service_account_v1.landing_zone_user

  metadata {
    name      = "${each.value.metadata[0].name}-binding"
    namespace = each.value.metadata[0].namespace
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.landing_zone_user[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = each.value.metadata[0].name
    namespace = each.value.metadata[0].namespace
  }
}

resource "kubernetes_secret_v1" "landing_zone_user_token" {
  provider = kubernetes.platform

  for_each = kubernetes_service_account_v1.landing_zone_user

  metadata {
    name      = "${each.value.metadata[0].name}-token"
    namespace = each.value.metadata[0].namespace
    annotations = {
      "kubernetes.io/service-account.name" = each.value.metadata[0].name
    }
  }

  type = "kubernetes.io/service-account-token"
}

resource "kubernetes_pod_v1" "landing_zone_sample_load" {
  provider = kubernetes.platform

  for_each = {
    for key, value in kubernetes_service_account_v1.landing_zone_user : key => value
    if local.landing_zone_namespace_services[key].sample_load.enabled
  }

  metadata {
    name      = "${each.value.metadata[0].name}-sample-load"
    namespace = each.value.metadata[0].namespace

    labels = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/sample-load"  = "true"
    }
  }

  spec {
    restart_policy = "Never"

    container {
      name    = "sample"
      image   = local.landing_zone_namespace_services[each.key].sample_load.image
      command = ["sh", "-c", "ls -la /mnt/secret && cat /mnt/secret/token | head -c 40 || true; sleep 3600"]

      volume_mount {
        name       = "namespace-token"
        mount_path = "/mnt/secret"
        read_only  = true
      }
    }

    volume {
      name = "namespace-token"

      secret {
        secret_name = kubernetes_secret_v1.landing_zone_user_token[each.key].metadata[0].name
      }
    }
  }
}
