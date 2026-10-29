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
        mode: z.enum(["managed", "data"]),
        type: z.string(),
        change: z
          .object({
            actions: z.array(z.string()).min(1).max(3),
            before: z.record(z.string(), z.unknown()).nullable(),
            after: z.record(z.string(), z.unknown()).nullable(),
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
  }
  return {
    classification: reasons.some((r) => r.classification === "blocked")
      ? "blocked"
      : reasons.some((r) => r.classification === "sensitive")
        ? "sensitive"
        : "ordinary",
    reasons,
  };
}

export const applicationPlatformImpactSchema =
  applicationUpgradeSafetySchema.extend({
    changedResourceTypes: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{0,127}$/))
      .max(200),
    sharedChanges: z.boolean(),
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
      known = platformTypes.has(resource.type);
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
        actions.includes("create")
          ? "platform-shared-replacement"
          : "platform-shared-deletion",
        "blocked",
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
  };
}
