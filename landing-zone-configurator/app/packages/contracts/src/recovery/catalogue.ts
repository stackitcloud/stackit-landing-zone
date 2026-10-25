/** All managed resource types reachable through the pinned Application root.
 * This catalogue is checked against native source in CI; a new orderable type
 * must define identity recovery or explicit lost-secret revocation first. */
export const applicationRecoveryStrategies = {
  terraform_data: "native-local",
  time_rotating: "native-local",
  stackit_resourcemanager_project: "import",
  stackit_network: "import",
  stackit_routing_table: "import",
  stackit_routing_table_route: "import",
  stackit_authorization_project_custom_role: "import",
  stackit_authorization_project_role_assignment: "import",
  stackit_objectstorage_bucket: "import",
  stackit_objectstorage_credentials_group: "import",
  stackit_objectstorage_credential: "revoke-lost-secret",
  stackit_service_account: "import",
  stackit_service_account_key: "revoke-lost-secret",
  stackit_secretsmanager_instance: "import",
  stackit_observability_instance: "import",
} as const;
