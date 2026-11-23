import { createHash } from "node:crypto";
import { z } from "zod";

const provider =
  /^provider\["registry\.(?:opentofu|terraform)\.org\/(?:stackitcloud\/stackit|hashicorp\/(?:random|time))"\](?:\.(?:eu01|eu02))?$/;
const builtinProvider =
  /^provider\["(?:terraform|opentofu)\.io\/builtin\/terraform"\]$/;
const privateProvider =
  /(?:^|\.)provider\["registry\.(?:opentofu|terraform)\.org\/(?:hashicorp\/(?:vault|kubernetes|helm)|grafana\/grafana|browningluke\/opnsense)"\](?:\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const cloudIdentity = z.string().min(1).max(256);
const resourceSchema = z.strictObject({
  address: z.string().min(1).max(4096),
  type: z.string().min(1).max(256),
  provider: z.string().min(1).max(4096),
  id: z.string().min(1).max(4096).nullable(),
  selectors: z.record(z.string(), z.string()).default({}),
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
  return raw === undefined || raw === null
    ? null
    : z.string().min(1).max(4096).parse(raw);
}
const selectorKeys = [
  "resource_id",
  "role",
  "subject",
  "project_id",
  "name",
  "bucket_name",
  "instance_id",
  "user_id",
  "credential_id",
  "credentials_group_id",
  "service_account_email",
  "key_id",
  "network_id",
  "network_area_id",
  "router_id",
  "server_id",
  "security_group_id",
  "rule_id",
] as const;
function selectors(type: string, value: unknown) {
  const attributes = object.parse(value);
  const hasId = identity(type, attributes) !== null;
  const result = Object.fromEntries(
    selectorKeys
      .filter(
        (key) =>
          typeof attributes[key] === "string" &&
          attributes[key].length > 0 &&
          (!hasId || key !== "name"),
      )
      .map((key) => [key, z.string().max(4096).parse(attributes[key])]),
  );
  if (hasId) return result;
  if (type.includes("role_assignment"))
    requireValue(
      ["resource_id", "role", "subject"].every(
        (key) => result[key] !== undefined,
      ),
      "retirement_resource_identity_missing",
    );
  else
    requireValue(
      type === "stackit_objectstorage_compliance_lock"
        ? Boolean(result.project_id)
        : Object.keys(result).some((key) => key !== "project_id"),
      "retirement_resource_identity_missing",
    );
  return result;
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
          builtinProvider.test(resource.provider) ||
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
        selectors: selectors(type, instance.attributes),
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
      expected.has(resource.address) &&
        retirementStateSha256(expected.get(resource.address)) ===
          retirementStateSha256(resource),
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
    requireValue(
      retirementStateSha256(original.selectors) ===
        retirementStateSha256(selectors(original.type, change.before)),
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

export const retirementAdapterCommit =
  "5f78fe54f5f3adae8593c75edaac9213fd6c42e6";
export const retirementProviderLockSha256 =
  "626f9eb77987fadd7dcddb7d2121b724ab62e5311769296ac495451413e6edb6";
export const retirementWorkerInputSchema = z.strictObject({
  id: z.uuid(),
  operation: z.enum(["plan", "apply"]),
  retirementId: z.uuid(),
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  scopeId: z.uuid(),
  phase: z.enum([
    "private_workloads",
    "remove_application",
    "remove_projects",
    "finalize_folders",
  ]),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  providerLockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  variables: z.record(z.string(), z.json()),
  variablesSha256: z.string().regex(/^[a-f0-9]{64}$/),
  baseline: retirementInventorySchema,
  before: retirementInventorySchema,
  beforeStateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  protectedServiceAccount: z.email(),
  protectedProjectIds: z.array(z.uuid()).min(1).max(32),
  key: z.unknown(),
  backend: z.strictObject({
    address: z.url(),
    lockAddress: z.url(),
    unlockAddress: z.url(),
    username: z.literal("runner"),
    password: z.string(),
  }),
  plan: z
    .strictObject({
      data: z.string().max(4 * Math.ceil((16 * 1024 * 1024) / 3)),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
});
/** Removes all secret-bearing before/after values before a worker reports a Plan. */
export function retirementPlanProjection(raw: unknown) {
  const plan = object.parse(raw);
  const entries = (value: unknown) =>
    z
      .array(object)
      .parse(value ?? [])
      .map((resource) => {
        const change = object.parse(resource.change);
        const type = z.string().parse(resource.type);
        const before =
          change.before === null ? null : object.parse(change.before);
        const field =
          type === "stackit_resourcemanager_folder"
            ? "folder_id"
            : type === "stackit_resourcemanager_project"
              ? "project_id"
              : "id";
        return {
          address: resource.address,
          type,
          mode: resource.mode,
          change: {
            actions: change.actions,
            before: before
              ? {
                  [field]: before[field] ?? null,
                  ...Object.fromEntries(
                    [...selectorKeys, "email"]
                      .filter((key) => typeof before[key] === "string")
                      .map((key) => [key, before[key]]),
                  ),
                }
              : null,
          },
        };
      });
  return {
    format_version: plan.format_version,
    ...(plan.complete === undefined ? {} : { complete: plan.complete }),
    ...(plan.errored === undefined ? {} : { errored: plan.errored }),
    ...(Array.isArray(plan.deferred_changes) && plan.deferred_changes.length
      ? { deferred_changes: [{}] }
      : {}),
    resource_changes: entries(plan.resource_changes),
    resource_drift: entries(plan.resource_drift),
  };
}
export function assertRetirementProtectedResources(
  raw: unknown,
  input: Pick<
    z.infer<typeof retirementWorkerInputSchema>,
    "protectedServiceAccount" | "protectedProjectIds"
  >,
) {
  const plan = object.parse(raw);
  for (const resource of z.array(object).parse(plan.resource_changes ?? [])) {
    const change = object.parse(resource.change);
    if (!z.array(z.string()).parse(change.actions).includes("delete")) continue;
    const before = object.parse(change.before ?? {});
    requireValue(
      !(
        resource.type === "stackit_resourcemanager_project" &&
        input.protectedProjectIds.includes(String(before.project_id))
      ),
      "retirement_control_inside_target",
    );
    requireValue(
      !(
        String(resource.type).includes("role_assignment") &&
        before.subject === input.protectedServiceAccount
      ),
      "retirement_cleanup_permission_would_be_removed",
    );
    requireValue(
      !(
        (String(resource.type).startsWith("stackit_service_account") ||
          String(resource.type).startsWith("stackit_serviceaccount")) &&
        (before.email === input.protectedServiceAccount ||
          before.service_account_email === input.protectedServiceAccount)
      ),
      "retirement_cleanup_identity_would_be_removed",
    );
  }
}
export function retirementPrivateTargets(inventory: RetirementInventory) {
  return inventory.resources
    .filter((resource) => privateProvider.test(resource.provider))
    .map((resource) => resource.address);
}

export function retirementStateSha256(raw: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(raw, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([left], [right]) =>
                left.localeCompare(right),
              ),
            )
          : value,
      ),
    )
    .digest("hex");
}
export function retirementFolderConflict(
  output: string,
  allowed: readonly string[],
): boolean {
  try {
    const events = output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => object.parse(JSON.parse(line)));
    if (
      events[0]?.type !== "version" ||
      !/^1\.\d+$/.test(String(events[0]?.ui))
    )
      return false;
    const errors = events
      .filter(
        (event) =>
          event.type === "diagnostic" &&
          object.parse(event.diagnostic).severity === "error",
      )
      .map((event) => object.parse(event.diagnostic));
    // Provider AddError diagnostics have no resource address. Corroborate them
    // with native apply_errored hooks for exactly the approved folder deletes.
    const failures = events
      .filter((event) => event.type === "apply_errored")
      .map((event) => object.parse(event.hook));
    return (
      errors.length > 0 &&
      failures.length === errors.length &&
      failures.every(
        (hook) =>
          hook.action === "delete" &&
          allowed.includes(String(object.parse(hook.resource).addr)),
      ) &&
      errors.every(
        (error) =>
          [
            "Error deleting folder",
            "Error deleting folder. Deletion may fail because associated projects remain hidden for up to 7 days after user deletion due to technical requirements.",
          ].includes(String(error.summary)) &&
          typeof error.detail === "string" &&
          /Calling API: 409 Conflict/.test(error.detail) &&
          /Folder has children\. Deletion not permitted/.test(error.detail) &&
          (error.address === undefined ||
            allowed.includes(String(error.address))),
      )
    );
  } catch {
    return false;
  }
}

/** Successful native delete hooks corroborate State removals; missing output is not proof. */
export function retirementCompletedDeletes(
  output: string,
  allowed: readonly string[],
) {
  const events = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => object.parse(JSON.parse(line)));
  requireValue(
    events[0]?.type === "version" && /^1\.\d+$/.test(String(events[0]?.ui)),
    "retirement_apply_events_incomplete",
  );
  const completed = new Set<string>();
  for (const event of events) {
    if (event.type !== "apply_complete") continue;
    const hook = object.parse(event.hook);
    if (hook.action === "read" || hook.action === "noop") continue;
    const address = z.string().parse(object.parse(hook.resource).addr);
    requireValue(
      hook.action === "delete" &&
        allowed.includes(address) &&
        !completed.has(address),
      "retirement_apply_event_unreviewed",
    );
    completed.add(address);
  }
  return [...completed].sort();
}
