output "retained_folder_ids" {
  description = "Managed folder UUIDs still retained in this phase; absence alone is not proof of project purge."
  value       = module.governance.folder_ids
}
