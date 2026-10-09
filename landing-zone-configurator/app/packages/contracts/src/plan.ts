import { z } from "zod";

export const applicationMvpAcceleratorCommit =
  "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f";
export const applicationRunnerSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  acceleratorCommit: z.enum([
    "88149782bf8e91dcdbb43a203b54337886023f7f",
    applicationMvpAcceleratorCommit,
  ]),
  maintenanceEnabled: z.literal(true).optional(),
});
export const platformUpgradeAcceleratorCommit =
  "c4b43c36af198985980b17626c48d357795e3fbd";
export const platformRunnerSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  acceleratorCommit: z.literal(platformUpgradeAcceleratorCommit),
});
/** Deliberately projects counts only: even addresses and diagnostics can contain secrets. */
export type PlanAction =
  | "unchanged"
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "read";
export type ActionCounts = Record<PlanAction, number>;
export interface PlanSummary {
  schemaVersion: 1;
  execution: "plan-only";
  applyAllowed: false;
  result: "changes" | "no-changes";
  resources: ActionCounts;
  drift: ActionCounts;
  changedOutputs: number;
  checks: { pass: number; fail: number; error: number; unknown: number };
  destructive: boolean;
  completeness: "complete" | "incomplete" | "not-reported";
}

export class InvalidPlan extends Error {
  constructor() {
    super(
      "Der Plan ist unvollständig, fehlgeschlagen oder hat ein nicht unterstütztes Format.",
    );
  }
}

const applicationResourceChangesSchema = z
  .array(
    z.strictObject({
      type: z.string().regex(/^[a-z][a-z0-9_]*$/),
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      action: z.enum([
        "create",
        "update",
        "delete",
        "replace",
        "read",
        "unchanged",
      ]),
      attributes: z
        .array(
          z.strictObject({
            name: z.string(),
            before: z.union([
              z.string().max(1024),
              z.number(),
              z.boolean(),
              z.null(),
            ]),
            after: z.union([
              z.string().max(1024),
              z.number(),
              z.boolean(),
              z.null(),
            ]),
            sensitive: z.boolean(),
            unknown: z.boolean(),
          }),
        )
        .max(30),
    }),
  )
  .max(10000);

export const applicationPlanPreviewSchema = z.strictObject({
  resources: applicationResourceChangesSchema,
  drift: applicationResourceChangesSchema.default([]),
});

export function applicationPlanPreview(raw: unknown) {
  const plan = object(raw);
  const allowed = new Set([
    "name",
    "description",
    "region",
    "organization_id",
    "parent_id",
    "project_id",
    "network_id",
    "network_area_id",
    "ipv4_cidr",
    "ipv4_prefix",
    "ipv4_prefix_length",
    "ipv6_cidr",
    "prefix_length",
    "cidr",
    "gateway",
    "role",
    "role_id",
    "public_ip",
    "availability_zone",
    "machine_type",
    "disk_size",
    "volume_size",
    "type",
    "enabled",
  ]);
  const scalar = (value: unknown) => {
    if (typeof value === "string") return value.slice(0, 1024);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value;
    return null;
  };
  const values = (value: unknown) => (value == null ? {} : object(value));
  const marked = (value: unknown, key: string) =>
    value === true ||
    (value != null &&
      typeof value === "object" &&
      (value as Record<string, unknown>)[key] !== undefined &&
      (value as Record<string, unknown>)[key] !== false);
  const changes = (input: unknown) =>
    array(input ?? []).map((item) => {
      const resource = object(item);
      const change = object(resource.change);
      const before = values(change.before);
      const after = values(change.after);
      const unknown = values(change.after_unknown);
      return {
        type: resource.type,
        name: resource.name,
        action: action(change.actions),
        attributes: [
          ...new Set([
            ...Object.keys(before),
            ...Object.keys(after),
            ...Object.keys(unknown),
          ]),
        ]
          .filter((key) => allowed.has(key))
          .map((key) => {
            const sensitive =
              marked(change.before_sensitive, key) ||
              marked(change.after_sensitive, key);
            const pending = marked(change.after_unknown, key);
            return {
              name: key,
              before: sensitive ? null : scalar(before[key]),
              after: sensitive || pending ? null : scalar(after[key]),
              sensitive,
              unknown: pending,
            };
          }),
      };
    });
  return applicationPlanPreviewSchema.parse({
    resources: changes(plan.resource_changes),
    drift: changes(plan.resource_drift),
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvalidPlan();
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new InvalidPlan();
  return value;
}
function action(value: unknown): PlanAction {
  const actions = array(value);
  if (actions.length === 1) {
    switch (actions[0]) {
      case "no-op":
        return "unchanged";
      case "create":
        return "create";
      case "update":
        return "update";
      case "delete":
        return "delete";
      case "read":
        return "read";
    }
  }
  if (
    actions.length === 2 &&
    ((actions[0] === "delete" && actions[1] === "create") ||
      (actions[0] === "create" && actions[1] === "delete"))
  )
    return "replace";
  throw new InvalidPlan();
}
function counts(value: unknown): ActionCounts {
  const result: ActionCounts = {
    unchanged: 0,
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    read: 0,
  };
  for (const item of array(value ?? [])) {
    const resource = object(item);
    if (resource.mode !== "managed" && resource.mode !== "data")
      throw new InvalidPlan();
    const operation = action(object(resource.change).actions);
    if (
      resource.mode === "data" &&
      operation !== "read" &&
      operation !== "unchanged"
    )
      throw new InvalidPlan();
    result[operation]++;
  }
  return result;
}

/** Call only with the JSON of a saved plan and the exit code from that exact plan command. */
export function summarizePlan(
  raw: unknown,
  exitCode: number,
  fullPlanEngine?: "opentofu-1.12.6",
): PlanSummary {
  if (exitCode !== 0 && exitCode !== 2) throw new InvalidPlan();
  const plan = object(raw);
  if (
    typeof plan.format_version !== "string" ||
    !/^1\.\d+$/.test(plan.format_version) ||
    plan.errored !== false ||
    !plan.configuration ||
    !plan.planned_values ||
    (plan.complete !== undefined && typeof plan.complete !== "boolean")
  )
    throw new InvalidPlan();
  // A state JSON is not a plan. Unknown major formats and partial failures fail closed.
  object(plan.configuration);
  object(plan.planned_values);
  for (const value of array(plan.resource_changes ?? [])) {
    const change = object(value);
    if (
      change.mode === "managed" &&
      change.type === "stackit_resourcemanager_folder" &&
      ["delete", "replace"].includes(action(object(change.change).actions))
    )
      throw new InvalidPlan();
  }
  const resources = counts(plan.resource_changes);
  const drift = counts(plan.resource_drift);
  let changedOutputs = 0;
  for (const output of Object.values(object(plan.output_changes ?? {}))) {
    const operation = action(object(output).actions);
    if (operation !== "unchanged") changedOutputs++;
    if (operation === "replace" || operation === "read")
      throw new InvalidPlan();
  }
  const checks = { pass: 0, fail: 0, error: 0, unknown: 0 };
  for (const check of array(plan.checks ?? [])) {
    const status = object(check).status;
    if (
      status !== "pass" &&
      status !== "fail" &&
      status !== "error" &&
      status !== "unknown"
    )
      throw new InvalidPlan();
    checks[status]++;
  }
  const pending =
    resources.create +
    resources.update +
    resources.delete +
    resources.replace +
    resources.read +
    changedOutputs;
  if (exitCode === 0 && pending > 0) throw new InvalidPlan();
  const fullOpenTofuPlan =
    fullPlanEngine === "opentofu-1.12.6" &&
    plan.terraform_version === "1.12.6" &&
    plan.format_version === "1.2" &&
    plan.deferred_changes === undefined;
  return {
    schemaVersion: 1,
    execution: "plan-only",
    applyAllowed: false,
    result: exitCode === 2 ? "changes" : "no-changes",
    resources,
    drift,
    changedOutputs,
    checks,
    destructive: resources.delete > 0 || resources.replace > 0,
    completeness:
      plan.complete === undefined
        ? fullOpenTofuPlan
          ? "complete"
          : "not-reported"
        : plan.complete
          ? "complete"
          : "incomplete",
  };
}
