output "dns_extension_zones" {
  description = "DNS zones configured for SKE DNS extension."
  value       = distinct(compact(var.dns.zones))
}

output "encrypted_volume_support" {
  description = "Configuration values for encrypted SKE volumes when enabled."
  value = var.encrypted_volumes.enabled ? {
    storage_class_name        = var.encrypted_volumes.storage_class_name
    kms_keyring_id            = stackit_kms_keyring.this[0].keyring_id
    kms_key_id                = stackit_kms_key.this[0].key_id
    kms_project_id            = stackit_resourcemanager_project.this.project_id
    kms_key_version           = var.encrypted_volumes.kms_key_version
    kms_service_account_email = stackit_service_account.kms_manager[0].email
  } : null
}

output "debug_bastion" {
  description = "Debug bastion metadata when enabled for private cluster troubleshooting."
  value = local.debug_bastion_enabled ? {
    enabled              = true
    server_id            = module.debug_bastion[0].server_id
    network_interface_id = module.debug_bastion[0].network_interface_id
    public_ip            = module.debug_bastion[0].public_ip
    ssh_user             = module.debug_bastion[0].ssh_user
    ssh_command          = module.debug_bastion[0].ssh_command
    } : {
    enabled              = false
    server_id            = null
    network_interface_id = null
    public_ip            = null
    ssh_user             = null
    ssh_command          = null
  }
}

output "observability_instance_id" {
  description = "The observability instance ID used for cluster extension."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].instance_id : null
}

output "observability_targets_url" {
  description = "The Prometheus query endpoint URL of the optional platform observability instance."
  value       = var.observability.enabled ? stackit_observability_instance.this[0].targets_url : null
}

output "project_container_id" {
  description = "The container ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.container_id
}

output "project_id" {
  description = "The project ID of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.project_id
}

output "project_name" {
  description = "The name of the created STACKIT project."
  value       = stackit_resourcemanager_project.this.name
}

output "ske_cluster_name" {
  description = "The name of the created SKE cluster."
  value       = stackit_ske_cluster.this.name
}

output "ske_cluster_region" {
  description = "The region of the created SKE cluster."
  value       = stackit_ske_cluster.this.region
}

output "kube_config" {
  description = "Kubeconfig for the created SKE cluster."
  value       = stackit_ske_kubeconfig.this.kube_config
  sensitive   = true
}
