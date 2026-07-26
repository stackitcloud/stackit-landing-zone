#############################
## LANDING ZONE NAMESPACES ##
#############################

locals {
  secrets_enforcement_default_exempt_principals = [
    "system:serviceaccount:external-secrets:external-secrets",
    "system:serviceaccount:external-secrets:external-secrets-operator",
  ]

  landing_zone_namespace_services = {
    for key, value in var.landing_zone_namespace_services : key => {
      demo_enabled             = value.demo_enabled
      demo_metrics_ingestion = {
        enabled         = value.demo_metrics_ingestion.enabled
        target_urls     = value.demo_metrics_ingestion.target_urls
        scheme          = lower(value.demo_metrics_ingestion.scheme)
        metrics_path    = value.demo_metrics_ingestion.metrics_path
        scrape_interval = value.demo_metrics_ingestion.scrape_interval
        scrape_timeout  = value.demo_metrics_ingestion.scrape_timeout
      }
      namespace                = value.namespace != null ? value.namespace : trim(replace(lower(replace("${var.landing_zones[key].project_code}-${var.landing_zones[key].env}", "/[^a-zA-Z0-9-]/", "-")), "/-{2,}/", "-"), "-")
      dns_subdomain            = value.dns_subdomain
      dns_fqdn                 = value.dns_subdomain != null && try(module.landing_zone[key].dns_zone_dns_name, null) != null ? "${value.dns_subdomain}.${module.landing_zone[key].dns_zone_dns_name}" : null
      service_account_name     = value.kubernetes_access.service_account_name != null ? value.kubernetes_access.service_account_name : trim(replace(lower(replace("${var.landing_zones[key].project_code}-${var.landing_zones[key].env}-ns-user", "/[^a-zA-Z0-9-]/", "-")), "/-{2,}/", "-"), "-")
      enable_kubernetes_access = value.kubernetes_access.enabled
      sample_load = {
        enabled = value.sample_load.enabled
        image   = value.sample_load.image
      }
      labels             = value.labels
      annotations        = value.annotations
      use_secretsmanager = value.secretsmanager
      secrets_enforcement = {
        enabled                   = value.secrets_enforcement.enabled
        mode                      = lower(value.secrets_enforcement.mode)
        allow_opaque_secret_types = value.secrets_enforcement.allow_opaque_secret_types
        break_glass = {
          enabled    = value.secrets_enforcement.break_glass.enabled
          ttl_hours  = value.secrets_enforcement.break_glass.ttl_hours
          principals = value.secrets_enforcement.break_glass.principals
        }
      }
    }
  }

  landing_zone_namespace_demo_services = {
    for key, value in local.landing_zone_namespace_services : key => {
      namespace                  = value.namespace
      use_secretsmanager         = value.use_secretsmanager
      landing_zone_project_id    = module.landing_zone[key].project_id
      secretsmanager_instance_id = module.landing_zone[key].secretsmanager_instance_id
      observability_instance_id  = module.landing_zone[key].observability_instance_id
      observability_grafana_url  = module.landing_zone[key].observability_grafana_url
      observability_admin_user   = module.landing_zone[key].observability_grafana_admin_user
      demo_metrics_ingestion_enabled         = value.demo_metrics_ingestion.enabled
      demo_metrics_ingestion_target_urls     = length(value.demo_metrics_ingestion.target_urls) > 0 ? value.demo_metrics_ingestion.target_urls : (
        value.sample_load.enabled && value.dns_fqdn != null ? ["${value.dns_fqdn}:80"] : []
      )
      demo_metrics_ingestion_scheme          = value.demo_metrics_ingestion.scheme
      demo_metrics_ingestion_metrics_path    = value.demo_metrics_ingestion.metrics_path
      demo_metrics_ingestion_scrape_interval = value.demo_metrics_ingestion.scrape_interval
      demo_metrics_ingestion_scrape_timeout  = value.demo_metrics_ingestion.scrape_timeout
      platform_project_id                = local.platform_kubernetes_cluster_key != null ? module.platform_kubernetes[local.platform_kubernetes_cluster_key].project_id : null
      platform_observability_instance_id = local.platform_kubernetes_cluster_key != null ? module.platform_kubernetes[local.platform_kubernetes_cluster_key].observability_instance_id : null
      platform_observability_targets_url = local.platform_kubernetes_cluster_key != null ? module.platform_kubernetes[local.platform_kubernetes_cluster_key].observability_targets_url : null
      dns_zone_name              = module.landing_zone[key].dns_zone_dns_name
    }
    if value.demo_enabled
  }

  landing_zone_namespace_demo_dashboard_passwords = {
    for key, value in local.landing_zone_namespace_services : key => module.landing_zone[key].observability_grafana_admin_password
    if value.demo_enabled && module.landing_zone[key].observability_instance_id != null
  }

  landing_zone_namespace_services_kyverno = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.secrets_enforcement.enabled
  }

  sample_gateway_lb_endpoint_by_key = {
    for key, data in data.kubernetes_resources.landing_zone_sample_gateway_service : key => {
      ip       = try(one(data.objects).status.loadBalancer.ingress[0].ip, null)
      hostname = try(one(data.objects).status.loadBalancer.ingress[0].hostname, null)
    }
  }
}

module "namespace_service_demo" {
  source = "./modules/namespace-service-demo"

  services            = local.landing_zone_namespace_demo_services
  dashboard_passwords = local.landing_zone_namespace_demo_dashboard_passwords
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

resource "helm_release" "demo_envoy_gateway" {
  provider = helm.platform
  count    = length([for svc in values(local.landing_zone_namespace_services) : svc if svc.sample_load.enabled && svc.dns_fqdn != null]) > 0 ? 1 : 0

  name             = "lz-demo-envoy-gateway"
  namespace        = "envoy-gateway-system"
  chart            = "oci://docker.io/envoyproxy/gateway-helm"
  create_namespace = true
  wait             = false
  timeout          = 600
  atomic           = false
  cleanup_on_fail  = false

  set = [
    {
      name  = "deployment.type"
      value = "Kubernetes"
    },
    {
      name  = "service.type"
      value = "LoadBalancer"
    },
  ]
}

resource "kubernetes_manifest" "landing_zone_gateway_class" {
  provider = kubernetes.platform
  count    = length([for svc in values(local.landing_zone_namespace_services) : svc if svc.sample_load.enabled && svc.dns_fqdn != null]) > 0 ? 1 : 0

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = "eg"
    }
    spec = {
      controllerName = "gateway.envoyproxy.io/gatewayclass-controller"
    }
  }

  computed_fields = [
    "metadata",
    "spec",
    "status",
  ]

  depends_on = [
    helm_release.demo_envoy_gateway,
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
      error_message = "Namespace service requires one platform_kubernetes deployment."
    }

    precondition {
      condition     = each.value.dns_subdomain == null || try(module.landing_zone[each.key].dns_zone_dns_name, null) != null
      error_message = "landing_zone_namespace_services.<key>.dns_subdomain requires the landing zone to have a DNS zone."
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
      "app.kubernetes.io/name"      = "sample-load"
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/sample-load"  = "true"
    }
  }

  spec {
    restart_policy = "Never"
    enable_service_links = false

    container {
      name    = "sample"
      image   = local.landing_zone_namespace_services[each.key].sample_load.image
      command = ["sh", "-c", "mkdir -p /www && printf 'ok\\nlanding_zone=%s\\nnamespace=%s\\n' '${each.key}' '${each.value.metadata[0].namespace}' > /www/index.html && cat > /www/metrics.txt <<'EOF'\n# HELP lz_demo_resource_count Demo namespace resource counts\n# TYPE lz_demo_resource_count gauge\nlz_demo_resource_count{namespace=\"${each.value.metadata[0].namespace}\",landing_zone=\"${each.key}\",resource=\"pods\"} 1\nlz_demo_resource_count{namespace=\"${each.value.metadata[0].namespace}\",landing_zone=\"${each.key}\",resource=\"services\"} 1\nlz_demo_resource_count{namespace=\"${each.value.metadata[0].namespace}\",landing_zone=\"${each.key}\",resource=\"gateways\"} 1\nlz_demo_resource_count{namespace=\"${each.value.metadata[0].namespace}\",landing_zone=\"${each.key}\",resource=\"httproutes\"} 1\nEOF\ncp /www/metrics.txt /www/metrics\nls -la /mnt/secret && cat /mnt/secret/token | head -c 40 || true; exec httpd -f -p 8080 -h /www"]

      port {
        container_port = 8080
        name           = "http"
      }

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

  lifecycle {
    ignore_changes = [
      metadata[0].annotations,
      spec[0].container[0].env,
    ]
  }
}

resource "kubernetes_service_v1" "landing_zone_sample_load" {
  provider = kubernetes.platform

  for_each = kubernetes_pod_v1.landing_zone_sample_load

  metadata {
    name      = each.value.metadata[0].name
    namespace = each.value.metadata[0].namespace

    labels = {
      "app.kubernetes.io/name"      = "sample-load"
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/sample-load"  = "true"
    }
  }

  spec {
    selector = {
      "stackit.cloud/landing-zone" = each.key
      "stackit.cloud/sample-load"  = "true"
    }

    port {
      name        = "http"
      port        = 80
      target_port = 8080
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

resource "kubernetes_manifest" "landing_zone_sample_gateway" {
  provider = kubernetes.platform

  for_each = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.sample_load.enabled && value.dns_fqdn != null
  }

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = "${kubernetes_service_v1.landing_zone_sample_load[each.key].metadata[0].name}-gw"
      namespace = kubernetes_namespace_v1.landing_zone[each.key].metadata[0].name
      annotations = {
        "external-dns.alpha.kubernetes.io/hostname" = each.value.dns_fqdn
      }
      labels = {
        "app.kubernetes.io/name"      = "sample-load"
        "stackit.cloud/landing-zone" = each.key
        "stackit.cloud/sample-load"  = "true"
      }
    }
    spec = {
      gatewayClassName = "eg"
      listeners = [
        {
          name     = "http"
          protocol = "HTTP"
          port     = 80
          allowedRoutes = {
            namespaces = {
              from = "Same"
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
    kubernetes_manifest.landing_zone_gateway_class,
    helm_release.demo_envoy_gateway,
  ]
}

resource "kubernetes_manifest" "landing_zone_sample_http_route" {
  provider = kubernetes.platform

  for_each = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.sample_load.enabled && value.dns_fqdn != null
  }

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "HTTPRoute"
    metadata = {
      name      = "${kubernetes_service_v1.landing_zone_sample_load[each.key].metadata[0].name}-route"
      namespace = kubernetes_namespace_v1.landing_zone[each.key].metadata[0].name
      labels = {
        "app.kubernetes.io/name"      = "sample-load"
        "stackit.cloud/landing-zone" = each.key
        "stackit.cloud/sample-load"  = "true"
      }
    }
    spec = {
      parentRefs = [
        {
          name = kubernetes_manifest.landing_zone_sample_gateway[each.key].manifest.metadata.name
        }
      ]
      rules = [
        {
          matches = [
            {
              path = {
                type  = "PathPrefix"
                value = "/"
              }
            }
          ]
          backendRefs = [
            {
              name = kubernetes_service_v1.landing_zone_sample_load[each.key].metadata[0].name
              port = 80
            }
          ]
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
    kubernetes_manifest.landing_zone_sample_gateway,
  ]
}

data "kubernetes_resources" "landing_zone_sample_gateway_service" {
  provider = kubernetes.platform

  for_each = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.sample_load.enabled && value.dns_fqdn != null
  }

  api_version    = "v1"
  kind           = "Service"
  namespace      = "envoy-gateway-system"
  label_selector = "gateway.envoyproxy.io/owning-gateway-name=${kubernetes_manifest.landing_zone_sample_gateway[each.key].manifest.metadata.name},gateway.envoyproxy.io/owning-gateway-namespace=${kubernetes_namespace_v1.landing_zone[each.key].metadata[0].name}"

  depends_on = [
    kubernetes_manifest.landing_zone_sample_gateway,
  ]
}

resource "stackit_dns_record_set" "landing_zone_sample_gateway" {
  for_each = {
    for key, value in local.landing_zone_namespace_services : key => value
    if value.sample_load.enabled && value.dns_fqdn != null
  }

  project_id = module.landing_zone[each.key].project_id
  zone_id    = module.landing_zone[each.key].dns_zone_id
  name       = each.value.dns_fqdn
  type       = try(local.sample_gateway_lb_endpoint_by_key[each.key].ip, null) != null ? "A" : "CNAME"
  ttl        = 60
  records = [
    coalesce(
      try(local.sample_gateway_lb_endpoint_by_key[each.key].ip, null),
      try(local.sample_gateway_lb_endpoint_by_key[each.key].hostname, null),
    ),
  ]

  lifecycle {
    precondition {
      condition = (
        try(local.sample_gateway_lb_endpoint_by_key[each.key].ip, null) != null ||
        try(local.sample_gateway_lb_endpoint_by_key[each.key].hostname, null) != null
      )
      error_message = "Gateway load balancer endpoint is not available yet for DNS record creation."
    }
  }
}
