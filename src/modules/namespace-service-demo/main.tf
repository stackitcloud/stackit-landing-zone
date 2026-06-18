terraform {
  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "~> 0.99.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.0"
    }
  }
}

locals {
  services_with_secrets = {
    for key, value in var.services : key => value
    if value.use_secretsmanager
  }

  services_with_observability = {
    for key, value in var.services : key => value
    if (
      try(value.observability_grafana_url, null) != null &&
      try(value.observability_admin_user, null) != null &&
      try(value.observability_instance_id, null) != null &&
      try(value.platform_project_id, null) != null &&
      try(value.platform_observability_instance_id, null) != null &&
      try(value.platform_observability_targets_url, null) != null
    )
  }

  services_with_demo_metrics_ingestion = {
    for key, value in local.services_with_observability : key => value
    if value.demo_metrics_ingestion_enabled
  }

  demo_metrics_ingestion_targets = {
    for key, value in local.services_with_demo_metrics_ingestion : key => (
      length(value.demo_metrics_ingestion_target_urls) > 0
      ? value.demo_metrics_ingestion_target_urls
      : ["a-d-d-${value.platform_observability_instance_id}.argus-${value.platform_observability_instance_id}.svc.cluster.local:9000"]
    )
  }

  observability_keys = keys(local.services_with_observability)

  observability_urls = distinct([
    for value in values(local.services_with_observability) : value.observability_grafana_url
  ])

  grafana_provider_url  = try(one(local.observability_urls), "https://127.0.0.1")
  grafana_provider_user = try(local.services_with_observability[local.observability_keys[0]].observability_admin_user, "unused")
  grafana_provider_pass = lookup(var.dashboard_passwords, try(local.observability_keys[0], ""), "unused")

  dashboard_uid = {
    for key, value in local.services_with_observability : key => substr("lz-${md5(key)}", 0, 20)
  }
}

provider "grafana" {
  alias = "observability"

  url  = local.grafana_provider_url
  auth = "${local.grafana_provider_user}:${nonsensitive(local.grafana_provider_pass)}"
}

resource "stackit_secretsmanager_user" "external_secret_demo" {
  for_each = local.services_with_secrets

  project_id    = each.value.landing_zone_project_id
  instance_id   = each.value.secretsmanager_instance_id
  description   = "Demo ExternalSecret reader for ${each.key}"
  write_enabled = true
}

resource "stackit_observability_credential" "platform_metrics_reader" {
  for_each = local.services_with_observability

  project_id  = each.value.platform_project_id
  instance_id = each.value.platform_observability_instance_id
  description = "Namespace demo metrics reader for ${each.key}"
}

resource "stackit_observability_scrapeconfig" "namespace_demo_ingestion" {
  for_each = local.services_with_demo_metrics_ingestion

  project_id      = each.value.platform_project_id
  instance_id     = each.value.platform_observability_instance_id
  name            = "namespace-demo-${each.key}-v3"
  scheme          = each.value.demo_metrics_ingestion_scheme
  metrics_path    = each.value.demo_metrics_ingestion_metrics_path
  scrape_interval = each.value.demo_metrics_ingestion_scrape_interval
  scrape_timeout  = each.value.demo_metrics_ingestion_scrape_timeout
  saml2 = {
    enable_url_parameters = false
  }

  targets = [
    {
      urls = local.demo_metrics_ingestion_targets[each.key]
      labels = {
        namespace    = each.value.namespace
        landing_zone = each.key
        source       = "namespace-demo"
      }
    }
  ]
}

resource "grafana_folder" "stackit_managed" {
  provider = grafana.observability

  count = length(local.services_with_observability) > 0 ? 1 : 0

  title = var.dashboard_folder_title
}

resource "grafana_data_source" "platform_prometheus" {
  provider = grafana.observability

  for_each = local.services_with_observability

  type = "prometheus"
  name = "Platform Prometheus (${each.key})"
  url  = each.value.platform_observability_targets_url

  basic_auth_enabled  = true
  basic_auth_username = stackit_observability_credential.platform_metrics_reader[each.key].username

  secure_json_data_encoded = jsonencode({
    basicAuthPassword = stackit_observability_credential.platform_metrics_reader[each.key].password
  })
}

resource "grafana_dashboard" "namespace_overview" {
  provider = grafana.observability

  for_each = local.services_with_observability

  folder      = grafana_folder.stackit_managed[0].uid
  overwrite   = true
  config_json = templatefile("${path.module}/dashboards/namespace-overview.json.tmpl", {
    dashboard_uid   = local.dashboard_uid[each.key]
    dashboard_title = "${each.key} Namespace Overview"
    namespace       = each.value.namespace
    datasource_uid  = grafana_data_source.platform_prometheus[each.key].uid
  })

  lifecycle {
    precondition {
      condition     = length(local.observability_urls) <= 1
      error_message = "Demo dashboard provisioning currently supports exactly one Grafana endpoint across enabled demo services."
    }

    precondition {
      condition     = lookup(var.dashboard_passwords, each.key, "") != ""
      error_message = "Missing Grafana admin password for dashboard provisioning."
    }
  }
}
