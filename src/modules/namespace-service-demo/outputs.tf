output "samples" {
  description = "Demo sample references for enabled namespace-service demos."
  value = {
    for key, value in var.services : key => {
      dashboard_folder_uid  = try(grafana_folder.stackit_managed[0].uid, null)
      dashboard_folder_name = try(grafana_folder.stackit_managed[0].title, null)
      namespace            = value.namespace
      external_secret_user = try(stackit_secretsmanager_user.external_secret_demo[key].username, null)
      dashboard_uid        = try(local.dashboard_uid[key], null)
      dashboard_url        = try("${value.observability_grafana_url}/d/${local.dashboard_uid[key]}", null)
      dashboard_api_url    = try("${value.observability_grafana_url}/api/dashboards/uid/${local.dashboard_uid[key]}", null)
    }
  }
}

output "secret_access" {
  description = "Credentials for demo Secrets Manager users keyed by landing zone."
  sensitive   = true
  value = {
    for key, value in stackit_secretsmanager_user.external_secret_demo : key => {
      username = value.username
      password = value.password
    }
  }
}
