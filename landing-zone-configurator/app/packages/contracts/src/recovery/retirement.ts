import { createHash } from "node:crypto";
import { z } from "zod";

const provider =
  /^provider\["registry\.(?:opentofu|terraform)\.org\/(?:stackitcloud\/stackit|hashicorp\/(?:random|time))"\](?:\.(?:eu01|eu02))?$/;
const privateProvider =
  /(?:^|\.)provider\["registry\.(?:opentofu|terraform)\.org\/(?:hashicorp\/(?:vault|kubernetes|helm)|grafana\/grafana|browningluke\/opnsense)"\](?:\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const cloudIdentity = z.string().min(1).max(256);
const resourceSchema = z.strictObject({
  address: z.string().min(1).max(4096),
  type: z.string().min(1).max(256),
  provider: z.string().min(1).max(4096),
  id: cloudIdentity.nullable(),
});
export const retirementInventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  lineage: z.uuid(),
  serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
  resources: z.array(resourceSchema).max(20000),
});
export type RetirementInventory = z.infer<typeof retirementInventorySchema>;
export type RetirementNativePhase =
  | "remove_projects"
  | "finalize_folders"
  | "remove_application"
  | "private_workloads";
const object = z.record(z.string(), z.unknown());
const jsonHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function identity(type: string, value: unknown) {
  const attributes = object.parse(value);
  const raw =
    attributes[
      type === "stackit_resourcemanager_folder"
        ? "folder_id"
        : type === "stackit_resourcemanager_project"
          ? "project_id"
          : "id"
    ];
  if (
    type === "stackit_resourcemanager_folder" ||
    type === "stackit_resourcemanager_project"
  )
    return cloudIdentity.parse(raw);
  return raw === undefined || raw === null ? null : cloudIdentity.parse(raw);
}
/** Node-only offline checks. Never interprets absence as a successful cloud deletion. */
export function retirementInventory(
  raw: unknown,
  options: { includePrivate?: boolean } = {},
): RetirementInventory {
  const state = z
    .object({
      version: z.literal(4),
      lineage: z.uuid(),
      serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
      resources: z.array(object).max(20000).default([]),
    })
    .parse(raw);
  const resources: RetirementInventory["resources"] = [];
  for (const resource of state.resources) {
    requireValue(
      resource.mode === "managed" || resource.mode === "data",
      "retirement_state_mode_unsupported",
    );
    if (resource.mode === "data") continue;
    requireValue(
      typeof resource.provider === "string" &&
        (provider.test(resource.provider) ||
          (options.includePrivate === true &&
            privateProvider.test(resource.provider))),
      "retirement_private_provider_cleanup_required",
    );
    const type = cloudIdentity.parse(resource.type);
    const name = cloudIdentity.parse(resource.name);
    requireValue(
      resource.module === undefined || typeof resource.module === "string",
      "retirement_state_address_invalid",
    );
    const address = [resource.module, type, name].filter(Boolean).join(".");
    for (const instance of z
      .array(object)
      .max(20000)
      .parse(resource.instances)) {
      requireValue(
        !instance.deposed && instance.status !== "tainted",
        "retirement_state_instance_unresolved",
      );
      const index = instance.index_key;
      requireValue(
        index === undefined ||
          typeof index === "string" ||
          (typeof index === "number" &&
            Number.isSafeInteger(index) &&
            index >= 0),
        "retirement_state_index_invalid",
      );
      resources.push({
        address:
          address + (index === undefined ? "" : `[${JSON.stringify(index)}]`),
        type,
        provider: resource.provider,
        id: identity(type, instance.attributes),
      });
    }
  }
  resources.sort((a, b) => a.address.localeCompare(b.address));
  requireValue(
    new Set(resources.map((r) => r.address)).size === resources.length,
    "retirement_state_duplicate_address",
  );
  return retirementInventorySchema.parse({
    schemaVersion: 1,
    lineage: state.lineage,
    serial: state.serial,
    resources,
  });
}
export function verifyRetirementState(
  current: RetirementInventory,
  baseline: RetirementInventory,
) {
  requireValue(
    current.lineage === baseline.lineage,
    "retirement_state_lineage_changed",
  );
  requireValue(
    current.serial >= baseline.serial,
    "retirement_state_serial_regressed",
  );
  const expected = new Map(
    baseline.resources.map((resource) => [resource.address, resource]),
  );
  for (const resource of current.resources)
    requireValue(
      JSON.stringify(expected.get(resource.address)) ===
        JSON.stringify(resource),
      "retirement_state_identity_changed",
    );
}
/** Validate a fresh native saved Plan against the pre-refresh State and captured scope. */
export function verifyRetirementPlan(
  raw: unknown,
  current: RetirementInventory,
  baseline: RetirementInventory,
  phase: RetirementNativePhase,
) {
  verifyRetirementState(current, baseline);
  const plan = z
    .object({
      format_version: z.string().regex(/^1\./),
      errored: z.literal(false).optional(),
      complete: z.literal(true).optional(),
      deferred_changes: z.array(z.unknown()).max(0).optional(),
      resource_drift: z.array(object).default([]),
      resource_changes: z.array(object).default([]),
    })
    .parse(raw);
  const expected = new Map(
    current.resources.map((resource) => [resource.address, resource]),
  );
  const privateAddresses = new Set(
    current.resources
      .filter((resource) => privateProvider.test(resource.provider))
      .map((resource) => resource.address),
  );
  requireValue(
    phase === "private_workloads" || privateAddresses.size === 0,
    "retirement_private_provider_cleanup_required",
  );
  const seen = new Set<string>(),
    deletes: RetirementInventory["resources"] = [];
  for (const drift of plan.resource_drift) {
    const change = object.parse(drift.change);
    requireValue(
      !(
        drift.mode === "managed" &&
        expected.has(String(drift.address)) &&
        JSON.stringify(change.actions) === '["delete"]'
      ),
      "retirement_resource_disappeared_during_refresh",
    );
  }
  for (const resource of plan.resource_changes) {
    const change = object.parse(resource.change);
    const actions = z.array(z.string()).parse(change.actions);
    if (resource.mode === "data") {
      requireValue(
        JSON.stringify(actions) === '["read"]' ||
          JSON.stringify(actions) === '["no-op"]',
        "retirement_data_change_invalid",
      );
      continue;
    }
    requireValue(resource.mode === "managed", "retirement_plan_mode_invalid");
    const address = z.string().parse(resource.address);
    const original = expected.get(address);
    requireValue(
      original && !seen.has(address) && original.type === resource.type,
      "retirement_plan_resource_unreviewed",
    );
    requireValue(
      original.id === identity(original.type, change.before),
      "retirement_plan_identity_changed",
    );
    seen.add(address);
    const governance = address.startsWith("module.governance.");
    requireValue(
      actions.length === 1 &&
        (actions[0] === "delete" || actions[0] === "no-op"),
      "retirement_plan_delete_only_required",
    );
    if (actions[0] === "no-op") {
      requireValue(
        phase !== "finalize_folders" || governance,
        "retirement_projects_still_present",
      );
      continue;
    }
    if (phase === "private_workloads")
      requireValue(
        privateAddresses.has(address),
        "retirement_private_cleanup_must_retain_infrastructure",
      );
    else if (phase === "remove_projects")
      requireValue(!governance, "retirement_governance_must_remain");
    else if (phase === "finalize_folders")
      requireValue(
        governance &&
          [
            "stackit_resourcemanager_folder",
            "stackit_authorization_folder_role_assignment",
          ].includes(original.type),
        "retirement_folder_scope_required",
      );
    else
      requireValue(
        !governance && original.type !== "stackit_resourcemanager_folder",
        "retirement_application_scope_required",
      );
    deletes.push(original);
  }
  if (phase === "private_workloads")
    requireValue(
      deletes.length === privateAddresses.size,
      "retirement_private_cleanup_incomplete",
    );
  else
    requireValue(
      seen.size === expected.size,
      "retirement_plan_inventory_incomplete",
    );
  return { phase, deletes, planSha256: jsonHash(raw) };
}
/** State persistence must agree with the exact approved native deletion set. */
export function verifyRetirementApply(
  before: RetirementInventory,
  after: RetirementInventory,
  deletes: RetirementInventory["resources"],
  succeeded: boolean,
) {
  verifyRetirementState(after, before);
  const allowed = new Set(deletes.map((resource) => resource.address));
  const remaining = new Set(
    after.resources.map((resource) => resource.address),
  );
  const removed = before.resources.filter(
    (resource) => !remaining.has(resource.address),
  );
  requireValue(
    removed.every((resource) => allowed.has(resource.address)),
    "retirement_apply_unreviewed_removal",
  );
  if (succeeded)
    requireValue(
      removed.length === allowed.size,
      "retirement_apply_incomplete",
    );
  requireValue(
    removed.length === 0 || after.serial > before.serial,
    "retirement_apply_state_not_advanced",
  );
  return { removed, remaining: after.resources };
}
