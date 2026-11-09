/** Synthetic native plan: no customer IDs, credentials or state. */
export function auditQueryMigrationPlan() {
  const project = "11111111-1111-4111-8111-111111111111";
  const logs = "22222222-2222-4222-8222-222222222222";
  const router = "33333333-3333-4333-8333-333333333333";
  const obs = "44444444-4444-4444-8444-444444444444";
  const mount = "55555555-5555-4555-8555-555555555555";
  const resource = (
    address: string,
    type: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) => ({
    address: `module.management.${address}`,
    mode: "managed" as const,
    type,
    change: {
      actions: [action],
      before,
      after,
      after_unknown: {} as Record<string, unknown>,
    },
  });
  const currentObs = {
    id: `${project},${obs}`,
    project_id: project,
    instance_id: obs,
    name: "synthetic-management",
    plan_name: "Observability-Starter-EU01",
    plan_id: "unchanged-plan",
    logs_retention_days: 7,
    acl: ["203.0.113.1/32"],
    otlp_http_logs_url: "https://observability.example.test/otlp/v1/logs",
  };
  const secret = {
    id: `${mount}/data/audit_logs_fixture`,
    mount,
    name: "audit_logs_fixture",
    data_json: "DO-NOT-EMIT",
  };
  const changes = [
    resource(
      "stackit_logs_instance.audit[0]",
      "stackit_logs_instance",
      "delete",
      {
        project_id: project,
        instance_id: logs,
        region: "eu01",
        ingest_otlp_url: "logs.example.test/otlp/v1/logs",
      },
      null,
    ),
    ...["read", "write"].map((permission) =>
      resource(
        `stackit_logs_access_token.audit_${permission}[0]`,
        "stackit_logs_access_token",
        "delete",
        {
          project_id: project,
          instance_id: logs,
          region: "eu01",
          permissions: [permission],
          access_token: "DO-NOT-EMIT",
        },
        null,
      ),
    ),
    resource(
      "stackit_telemetryrouter_destination.audit_logs[0]",
      "stackit_telemetryrouter_destination",
      "delete",
      {
        project_id: project,
        instance_id: router,
        region: "eu01",
        config: {
          config_type: "OpenTelemetry",
          opentelemetry: {
            uri: "https://logs.example.test/otlp/v1/logs",
            bearer_token: "DO-NOT-EMIT",
          },
        },
      },
      null,
    ),
    resource(
      "stackit_observability_credential.audit[0]",
      "stackit_observability_credential",
      "create",
      null,
      { project_id: project, instance_id: obs, username: null, password: null },
    ),
    resource(
      "stackit_telemetryrouter_destination.audit_observability[0]",
      "stackit_telemetryrouter_destination",
      "create",
      null,
      {
        project_id: project,
        instance_id: router,
        region: "eu01",
        config: {
          config_type: "OpenTelemetry",
          opentelemetry: {
            uri: currentObs.otlp_http_logs_url,
            basic_auth: { username: null, password: null },
          },
        },
      },
    ),
    resource(
      "stackit_observability_instance.this[0]",
      "stackit_observability_instance",
      "update",
      currentObs,
      {
        ...currentObs,
        acl: ["203.0.113.1/32", "192.0.2.0/24"],
        plan_id: null,
        logs_retention_days: null,
      },
    ),
    resource(
      "vault_kv_secret_v2.audit_logs[0]",
      "vault_kv_secret_v2",
      "update",
      secret,
      { ...secret, data_json: null },
    ),
  ];
  const observation = changes.find(
    (r) => r.type === "stackit_observability_instance",
  );
  if (!observation) throw new Error("synthetic-fixture-missing");
  observation.change.after_unknown = {
    plan_id: true,
    logs_retention_days: true,
  };
  for (const [name, type, values] of [
    [
      "stackit_telemetryrouter_instance.audit[0]",
      "stackit_telemetryrouter_instance",
      { project_id: project, instance_id: router, region: "eu01" },
    ],
    [
      "stackit_telemetryrouter_destination.audit_archive[0]",
      "stackit_telemetryrouter_destination",
      {
        project_id: project,
        instance_id: router,
        config: {
          config_type: "S3",
          s3: {
            bucket: "synthetic-archive",
            access_key: { secret: "DO-NOT-EMIT" },
          },
        },
      },
    ],
    [
      "stackit_objectstorage_bucket.audit_logs",
      "stackit_objectstorage_bucket",
      { project_id: project, name: "synthetic-archive" },
    ],
  ] as const)
    changes.push(
      resource(name, type, "no-op", values, structuredClone(values)),
    );
  return {
    format_version: "1.2",
    terraform_version: "1.12.6",
    complete: true,
    errored: false,
    planned_values: { root_module: {} },
    resource_changes: changes,
  };
}
