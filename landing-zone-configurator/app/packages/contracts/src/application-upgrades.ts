import { z } from "zod";

export const applicationUpgradeClassificationSchema = z.enum([
  "ordinary",
  "sensitive",
  "blocked",
]);
export const applicationUpgradeReasonSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/),
  path: z.string().max(256),
  classification: applicationUpgradeClassificationSchema,
});
export const applicationUpgradeSafetySchema = z.strictObject({
  classification: applicationUpgradeClassificationSchema,
  reasons: z.array(applicationUpgradeReasonSchema).max(1001),
  iamActions: z
    .strictObject({
      delete: z.number().int().min(0).max(1000),
      replace: z.number().int().min(0).max(1000),
    })
    .optional(),
});
export type ApplicationUpgradeSafety = z.infer<
  typeof applicationUpgradeSafetySchema
>;
export const applicationUpgradeEdgePolicySchema = z.strictObject({
  sensitive: z
    .enum(["approval-required", "direct"])
    .default("approval-required"),
});
export const applicationTemplateUpgradeRequestSchema = z.strictObject({
  edgeId: z.uuid(),
  expectedBindingId: z.uuid().nullable(),
  expectedVersionId: z.uuid(),
  confirmUpgrade: z.literal(true),
  parameters: z.record(z.string(), z.json()).optional(),
});
export const applicationUpgradeWithdrawalRequestSchema = z.strictObject({
  expectedBindingId: z.uuid(),
  expectedVersionId: z.uuid(),
  lastAppliedJobId: z.uuid().nullable(),
  confirmWithdrawal: z.literal(true),
});
export const applicationUpgradePolicyRefreshRequestSchema =
  applicationUpgradeWithdrawalRequestSchema
    .omit({ confirmWithdrawal: true })
    .extend({
      edgeId: z.uuid(),
      confirmPolicyRefresh: z.literal(true),
    });
export const applicationUpgradePolicyUpdateSchema = z.object({
  canRefresh: z.boolean(),
  blockers: z.array(z.string().max(128)).max(50),
  edgeId: z.uuid(),
  sensitivePolicy: z.enum(["direct", "approval-required"]),
});
export const applicationUpgradeWithdrawalContextSchema = z.object({
  canWithdraw: z.boolean(),
  blockers: z.array(z.string().max(128)).max(50),
  expectedBindingId: z.uuid().nullable(),
  expectedVersionId: z.uuid(),
  lastAppliedJobId: z.uuid().nullable(),
  restoreVersionId: z.uuid(),
});
export const applicationUpgradeAssessmentSchema =
  applicationUpgradeSafetySchema.extend({
    approvalPolicy: z.enum(["approval-required", "direct"]),
    retainedParameters: z.record(z.string(), z.json()),
    targetSettings: z.record(z.string(), z.json()),
    requiredParameters: z
      .array(
        z.strictObject({
          path: z.string().max(128),
          required: z.boolean(),
          hasDefault: z.boolean(),
        }),
      )
      .max(100),
    requiresFreshPlan: z.literal(true),
    applyAllowed: z.literal(false),
  });

const managedTypes = new Set([
  "stackit_telemetrylink",
  "stackit_telemetryrouter_access_token",
  "terraform_data",
  "time_rotating",
  "stackit_resourcemanager_project",
  "stackit_network",
  "stackit_routing_table",
  "stackit_routing_table_route",
  "stackit_authorization_project_custom_role",
  "stackit_authorization_project_role_assignment",
  "stackit_objectstorage_bucket",
  "stackit_objectstorage_credentials_group",
  "stackit_objectstorage_credential",
  "stackit_service_account",
  "stackit_service_account_key",
  "stackit_secretsmanager_instance",
  "stackit_observability_instance",
]);
const planSchema = z.object({
  format_version: z.literal("1.2"),
  terraform_version: z.literal("1.12.6"),
  complete: z.boolean().optional(),
  errored: z.boolean().optional(),
  deferred_changes: z.array(z.unknown()).optional(),
  planned_values: z.object({ root_module: z.record(z.string(), z.unknown()) }),
  resource_changes: z
    .array(
      z.object({
        address: z.string().max(512).optional(),
        mode: z.enum(["managed", "data"]),
        type: z.string(),
        change: z
          .object({
            actions: z.array(z.string()).min(1).max(3),
            before: z.record(z.string(), z.unknown()).nullable(),
            after: z.record(z.string(), z.unknown()).nullable(),
            after_unknown: z.record(z.string(), z.unknown()).optional(),
          })
          .refine(
            (value) =>
              Object.hasOwn(value, "before") && Object.hasOwn(value, "after"),
          ),
      }),
    )
    .max(1000),
});
/** No addresses, before/after values, credentials or permission IDs leave this projection. */
export function classifyApplicationUpgradePlan(
  rawPlan: unknown,
): ApplicationUpgradeSafety {
  const reasons: ApplicationUpgradeSafety["reasons"] = [];
  const add = (
    code: string,
    path: string,
    classification: ApplicationUpgradeSafety["classification"],
  ) => reasons.push({ code, path, classification });
  const parsed = planSchema.safeParse(rawPlan);
  if (!parsed.success)
    return {
      classification: "blocked",
      reasons: [
        {
          code: "plan-invalid-or-incomplete",
          path: "plan",
          classification: "blocked",
        },
      ],
    };
  const plan = parsed.data;
  const iamActions = { delete: 0, replace: 0 };
  if (
    plan.complete === false ||
    plan.errored === true ||
    (plan.deferred_changes?.length ?? 0) > 0
  )
    add("plan-incomplete", "plan", "blocked");
  for (const [index, resource] of plan.resource_changes.entries()) {
    const path = `resource_changes.${index}`,
      actions = resource.change.actions;
    if (actions.includes("delete")) {
      // Only project role definitions/assignments are policy transitions. Never
      // extend this exception to projects, services, identities or credentials.
      if (
        resource.mode === "managed" &&
        [
          "stackit_authorization_project_custom_role",
          "stackit_authorization_project_role_assignment",
        ].includes(resource.type) &&
        ["delete", "delete,create", "create,delete"].includes(actions.join(","))
      ) {
        iamActions[actions.length === 1 ? "delete" : "replace"]++;
        add("plan-iam-transition", path, "sensitive");
        continue;
      }
      add(
        actions.includes("create")
          ? "plan-resource-replacement"
          : "plan-resource-deletion",
        path,
        "blocked",
      );
      continue;
    }
    if (
      actions.length !== 1 ||
      !["no-op", "read", "create", "update"].includes(actions[0] ?? "")
    ) {
      add("plan-unknown-action", path, "blocked");
      continue;
    }
    const known =
      resource.mode === "data"
        ? resource.type === "stackit_network_area_region"
        : managedTypes.has(resource.type);
    if (!known) {
      add("plan-unknown-resource", path, "blocked");
      continue;
    }
    if (actions[0] === "read" && resource.mode !== "data") {
      add("plan-unknown-action", path, "blocked");
      continue;
    }
    if (actions[0] === "no-op" || actions[0] === "read") continue;
    if (resource.mode === "data") {
      add("plan-unknown-action", path, "blocked");
      continue;
    }
    if (
      resource.type.includes("authorization") ||
      resource.type.startsWith("stackit_service_account")
    )
      add("plan-iam-change", path, "sensitive");
    else if (
      resource.type.includes("credential") ||
      resource.type === "time_rotating"
    )
      add("plan-key-change", path, "sensitive");
    else if (
      resource.type.includes("network") ||
      resource.type.includes("routing_table")
    )
      add("plan-network-change", path, "sensitive");
    else if (
      resource.type === "stackit_resourcemanager_project" &&
      actions[0] === "update"
    )
      add("plan-project-change", path, "sensitive");
    else if (
      resource.type === "stackit_observability_instance" ||
      resource.type === "stackit_secretsmanager_instance"
    )
      // Provider acceptance does not prove that capacity or retained data is safe.
      // Classify the whole service change, including future provider attributes.
      add("plan-service-change", path, "sensitive");
  }
  return {
    classification: reasons.some((r) => r.classification === "blocked")
      ? "blocked"
      : reasons.some((r) => r.classification === "sensitive")
        ? "sensitive"
        : "ordinary",
    reasons,
    ...(iamActions.delete + iamActions.replace > 0 ? { iamActions } : {}),
  };
}

export const applicationPlatformImpactSchema =
  applicationUpgradeSafetySchema.extend({
    changedResourceTypes: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{0,127}$/))
      .max(200),
    sharedChanges: z.boolean(),
    auditMigration: z
      .strictObject({
        kind: z.literal("logs-to-observability"),
        retiredResources: z.literal(4),
      })
      .optional(),
  });
const platformTypes = new Set([
  ...managedTypes,
  "grafana_dashboard",
  "grafana_data_source",
  "grafana_folder",
  "helm_release",
  "kubernetes_manifest",
  "kubernetes_namespace_v1",
  "kubernetes_pod_v1",
  "kubernetes_role_binding_v1",
  "kubernetes_role_v1",
  "kubernetes_secret_v1",
  "kubernetes_service_account_v1",
  "kubernetes_service_v1",
  "opnsense_firewall_alias",
  "opnsense_firewall_category",
  "opnsense_firewall_filter",
  "opnsense_firewall_nat",
  "opnsense_firewall_nat_port_forward",
  "opnsense_route",
  "random_password",
  "stackit_authorization_folder_role_assignment",
  "stackit_authorization_organization_role_assignment",
  "stackit_authorization_service_account_role_assignment",
  "stackit_dns_zone",
  "stackit_git",
  "stackit_image",
  "stackit_key_pair",
  "stackit_kms_key",
  "stackit_kms_keyring",
  "stackit_logs_access_token",
  "stackit_logs_instance",
  "stackit_network_area",
  "stackit_network_area_region",
  "stackit_network_interface",
  "stackit_objectstorage_compliance_lock",
  "stackit_objectstorage_default_retention",
  "stackit_observability_credential",
  "stackit_observability_scrapeconfig",
  "stackit_public_ip",
  "stackit_resourcemanager_folder",
  "stackit_secretsmanager_user",
  "stackit_security_group",
  "stackit_security_group_rule",
  "stackit_server",
  "stackit_service_account_federated_identity_provider",
  "stackit_ske_cluster",
  "stackit_ske_kubeconfig",
  "stackit_telemetrylink",
  "stackit_telemetryrouter_access_token",
  "stackit_telemetryrouter_destination",
  "stackit_telemetryrouter_instance",
  "stackit_volume",
  "stackit_vpn_connection",
  "stackit_vpn_gateway",
  "stackit_vpn_gateway_status",
  "time_sleep",
  "vault_kv_secret_v2",
]);
/** Run only when the Platform has dependent Applications; no raw values leave the Worker. */
export function classifyPlatformApplicationImpactPlan(
  rawPlan: unknown,
): z.infer<typeof applicationPlatformImpactSchema> {
  const parsed = planSchema.safeParse(rawPlan);
  if (!parsed.success)
    return {
      classification: "blocked",
      reasons: [
        {
          code: "platform-plan-invalid-or-incomplete",
          path: "plan",
          classification: "blocked",
        },
      ],
      changedResourceTypes: [],
      sharedChanges: true,
    };
  const plan = parsed.data,
    reasons: ApplicationUpgradeSafety["reasons"] = [],
    types = new Set<string>();
  const auditMigration = reviewedAuditQueryMigration(plan.resource_changes);
  let sharedChanges = false;
  if (
    plan.complete === false ||
    plan.errored === true ||
    (plan.deferred_changes?.length ?? 0) > 0
  )
    reasons.push({
      code: "platform-plan-incomplete",
      path: "plan",
      classification: "blocked",
    });
  for (const [index, resource] of plan.resource_changes.entries()) {
    const path = `resource_changes.${index}`,
      actions = resource.change.actions,
      known =
        platformTypes.has(resource.type) ||
        (resource.mode === "data" &&
          resource.type === "stackit_public_ip_ranges");
    const add = (code: string, classification: "sensitive" | "blocked") =>
      reasons.push({ code, path, classification });
    if (!known) {
      add("platform-plan-unknown-resource", "blocked");
      sharedChanges = true;
      continue;
    }
    if (
      actions.length === 1 &&
      actions[0] === "read" &&
      resource.mode !== "data"
    ) {
      sharedChanges = true;
      add("platform-plan-unknown-action", "blocked");
      continue;
    }
    if (actions.length === 1 && ["no-op", "read"].includes(actions[0] ?? ""))
      continue;
    sharedChanges = true;
    types.add(resource.type);
    if (actions.includes("delete"))
      add(
        auditMigration
          ? "platform-audit-query-migration"
          : actions.includes("create")
            ? "platform-shared-replacement"
            : "platform-shared-deletion",
        auditMigration ? "sensitive" : "blocked",
      );
    else if (
      actions.length !== 1 ||
      !["create", "update"].includes(actions[0] ?? "") ||
      resource.mode === "data"
    )
      add("platform-plan-unknown-action", "blocked");
    else add("platform-shared-resource-change", "sensitive");
  }
  return {
    classification: reasons.some((r) => r.classification === "blocked")
      ? "blocked"
      : reasons.some((r) => r.classification === "sensitive")
        ? "sensitive"
        : "ordinary",
    reasons,
    changedResourceTypes: [...types].sort(),
    sharedChanges,
    ...(auditMigration
      ? {
          auditMigration: {
            kind: "logs-to-observability" as const,
            retiredResources: 4 as const,
          },
        }
      : {}),
  };
}

/** Private native-plan inspection: only the reviewed eight-action query-store switch. */
function reviewedAuditQueryMigration(
  resources: z.infer<typeof planSchema>["resource_changes"],
): boolean {
  const base = "module.management.";
  const expected: Record<string, [string, string]> = {
    "stackit_logs_instance.audit[0]": ["stackit_logs_instance", "delete"],
    "stackit_logs_access_token.audit_read[0]": [
      "stackit_logs_access_token",
      "delete",
    ],
    "stackit_logs_access_token.audit_write[0]": [
      "stackit_logs_access_token",
      "delete",
    ],
    "stackit_telemetryrouter_destination.audit_logs[0]": [
      "stackit_telemetryrouter_destination",
      "delete",
    ],
    "stackit_observability_credential.audit[0]": [
      "stackit_observability_credential",
      "create",
    ],
    "stackit_telemetryrouter_destination.audit_observability[0]": [
      "stackit_telemetryrouter_destination",
      "create",
    ],
    "stackit_observability_instance.this[0]": [
      "stackit_observability_instance",
      "update",
    ],
    "vault_kv_secret_v2.audit_logs[0]": ["vault_kv_secret_v2", "update"],
  };
  const changed = resources.filter(
    (r) =>
      !(
        r.change.actions.length === 1 &&
        ["no-op", "read"].includes(r.change.actions[0] ?? "")
      ),
  );
  if (changed.length !== 8) return false;
  const indexed = new Map(resources.map((r) => [r.address, r]));
  if (indexed.size !== resources.length) return false;
  for (const [address, [type, action]] of Object.entries(expected)) {
    const r = indexed.get(base + address);
    if (
      !r ||
      r.mode !== "managed" ||
      r.type !== type ||
      r.change.actions.length !== 1 ||
      r.change.actions[0] !== action
    )
      return false;
    if (action === "delete" && (!r.change.before || r.change.after !== null))
      return false;
    if (action === "create" && (r.change.before !== null || !r.change.after))
      return false;
  }
  const before = (name: string) =>
    indexed.get(base + name)?.change.before ?? {};
  const after = (name: string) => indexed.get(base + name)?.change.after ?? {};
  const logs = before("stackit_logs_instance.audit[0]");
  const old = before("stackit_telemetryrouter_destination.audit_logs[0]");
  const next = after(
    "stackit_telemetryrouter_destination.audit_observability[0]",
  );
  const obs = before("stackit_observability_instance.this[0]");
  const obsAfter = after("stackit_observability_instance.this[0]");
  const credential = after("stackit_observability_credential.audit[0]");
  const uuid = (v: unknown) => z.uuid().safeParse(v).success;
  if (
    ![
      logs.project_id,
      logs.instance_id,
      old.instance_id,
      obs.instance_id,
    ].every(uuid) ||
    !["eu01", "eu02"].includes(String(logs.region))
  )
    return false;
  const sameProject = (v: Record<string, unknown>) =>
    v.project_id === logs.project_id;
  if (
    ![old, next, obs, obsAfter, credential].every(sameProject) ||
    next.instance_id !== old.instance_id ||
    next.region !== logs.region ||
    old.region !== logs.region ||
    credential.instance_id !== obs.instance_id ||
    obsAfter.instance_id !== obs.instance_id ||
    obsAfter.id !== obs.id ||
    typeof obs.id !== "string"
  )
    return false;
  for (const [name, permission] of [
    ["audit_read", "read"],
    ["audit_write", "write"],
  ]) {
    const token = before(`stackit_logs_access_token.${name}[0]`);
    if (
      !sameProject(token) ||
      token.instance_id !== logs.instance_id ||
      token.region !== logs.region ||
      !sameJson(token.permissions, [permission])
    )
      return false;
  }
  const config = (v: Record<string, unknown>) =>
    v.config as
      | {
          config_type?: unknown;
          opentelemetry?: { uri?: unknown; basic_auth?: unknown };
        }
      | undefined;
  if (
    config(old)?.config_type !== "OpenTelemetry" ||
    config(next)?.config_type !== "OpenTelemetry" ||
    typeof logs.ingest_otlp_url !== "string" ||
    config(old)?.opentelemetry?.uri !==
      `https://${logs.ingest_otlp_url.replace(/^https:\/\//, "")}` ||
    typeof obs.otlp_http_logs_url !== "string" ||
    !obs.otlp_http_logs_url.startsWith("https://") ||
    config(next)?.opentelemetry?.uri !== obs.otlp_http_logs_url ||
    !config(next)?.opentelemetry?.basic_auth
  )
    return false;
  const unknown =
    indexed.get(base + "stackit_observability_instance.this[0]")?.change
      .after_unknown ?? {};
  for (const key of new Set([...Object.keys(obs), ...Object.keys(obsAfter)])) {
    if (
      key === "acl" ||
      ((key === "plan_id" || key === "logs_retention_days") &&
        unknown[key] === true &&
        obsAfter[key] == null)
    )
      continue;
    if (!sameJson(obs[key], obsAfter[key])) return false;
  }
  if (
    !Array.isArray(obsAfter.acl) ||
    obsAfter.acl.some((v) => typeof v !== "string")
  )
    return false;
  const secret = before("vault_kv_secret_v2.audit_logs[0]"),
    secretAfter = after("vault_kv_secret_v2.audit_logs[0]");
  if (
    typeof secret.name !== "string" ||
    !secret.name.startsWith("audit_logs_") ||
    !uuid(secret.mount) ||
    !["id", "mount", "name"].every(
      (k) => typeof secret[k] === "string" && secret[k] === secretAfter[k],
    )
  )
    return false;
  for (const [address, type] of [
    [
      "stackit_telemetryrouter_instance.audit[0]",
      "stackit_telemetryrouter_instance",
    ],
    [
      "stackit_telemetryrouter_destination.audit_archive[0]",
      "stackit_telemetryrouter_destination",
    ],
    ["stackit_objectstorage_bucket.audit_logs", "stackit_objectstorage_bucket"],
  ]) {
    const r = indexed.get(base + address);
    if (
      !r ||
      r.mode !== "managed" ||
      r.type !== type ||
      !sameJson(r.change.actions, ["no-op"]) ||
      !r.change.before ||
      !sameJson(r.change.before, r.change.after) ||
      !sameProject(r.change.before)
    )
      return false;
    if (
      type === "stackit_telemetryrouter_instance" &&
      (r.change.before.instance_id !== old.instance_id ||
        r.change.before.region !== logs.region)
    )
      return false;
    if (
      type === "stackit_telemetryrouter_destination" &&
      (r.change.before.instance_id !== old.instance_id ||
        (r.change.before.config as { config_type?: unknown })?.config_type !==
          "S3")
    )
      return false;
  }
  return true;
}
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object")
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameJson(v, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(
      (k) => Object.hasOwn(right, k) && sameJson(left[k], right[k]),
    )
  );
}
