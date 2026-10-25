import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ApplicationStateRecoveryImport,
  ApplicationStateRecoveryRevocation,
} from "../application-state-recovery.js";

const resource = z
  .object({
    module: z.string().optional(),
    mode: z.enum(["managed", "data"]),
    type: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
    provider: z.string(),
    instances: z
      .array(
        z
          .object({
            index_key: z.union([z.string(), z.number().int()]).optional(),
            attributes: z.record(z.string(), z.json()),
            deposed: z.string().optional(),
            status: z.string().optional(),
          })
          .passthrough(),
      )
      .max(1000)
      .default([]),
  })
  .passthrough();
const document = z
  .object({
    version: z.literal(4),
    terraform_version: z.literal("1.12.6"),
    serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
    // OpenTofu's native UUID generator does not set RFC version/variant bits.
    // State lineage is an opaque identity, unlike application/CF RFC UUIDs.
    lineage: z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/),
    resources: z.array(resource).max(2000),
  })
  .passthrough();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function recoverySha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}
export function readRecoveryState(bytes: Buffer, instanceId: string) {
  z.uuid().parse(instanceId);
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    throw new Error("checkpoint-invalid");
  const state = document.parse(JSON.parse(bytes.toString("utf8")));
  const addresses = new Set<string>();
  const instances = state.resources.flatMap((r) =>
    r.instances.map((i) => {
      const address = `${r.module ? `${r.module}.` : ""}${r.mode === "data" ? "data." : ""}${r.type}.${r.name}${
        i.index_key === undefined ? "" : `[${JSON.stringify(i.index_key)}]`
      }`;
      if (addresses.has(address) || i.deposed || i.status === "tainted")
        throw new Error("checkpoint-invalid");
      addresses.add(address);
      return { address, resource: r, instance: i };
    }),
  );
  const roots = instances.filter(
    (i) => i.address === "terraform_data.contract",
  );
  const input = roots[0]?.instance.attributes.input;
  const bound =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && !Array.isArray(input)
        ? input.value
        : undefined;
  if (roots.length !== 1 || bound !== instanceId)
    throw new Error("checkpoint-invalid");
  return { state, instances, sha256: recoverySha256(bytes) };
}

/** Import reevaluates root outputs. Retain the previous outputs until a fresh
 * normal Plan/Apply explicitly publishes newly computed ones. No resource data,
 * lineage, serial or check result is synthesized or altered here. */
export function retainRecoveryOutputs(
  original: Buffer,
  imported: Buffer,
  instanceId: string,
): Buffer {
  const before = readRecoveryState(original, instanceId).state;
  const after = readRecoveryState(imported, instanceId).state;
  if (Object.hasOwn(before, "outputs")) after.outputs = before.outputs;
  else delete after.outputs;
  return Buffer.from(`${JSON.stringify(after, null, 2)}\n`);
}

/** Verify native imports; never accept a replacement State merely because it parses. */
export function verifyImportedRecoveryState(input: {
  original: Buffer;
  candidate: Buffer;
  instanceId: string;
  imports: ApplicationStateRecoveryImport[];
  revocations?: ApplicationStateRecoveryRevocation[];
}) {
  const before = readRecoveryState(input.original, input.instanceId);
  const after = readRecoveryState(input.candidate, input.instanceId);
  if (
    before.state.lineage !== after.state.lineage ||
    after.state.serial < before.state.serial ||
    ((input.imports.length > 0 ||
      input.revocations?.some((r) => r.discardIncompleteState)) &&
      after.state.serial <= before.state.serial)
  )
    throw new Error("checkpoint-changed");
  const existing = new Map(before.instances.map((i) => [i.address, i]));
  const current = new Map(after.instances.map((i) => [i.address, i]));
  const imports = new Map(input.imports.map((i) => [i.address, i]));
  if (imports.size !== input.imports.length)
    throw new Error("cloud-resource-ambiguous");
  const removals = new Set<string>();
  for (const r of input.revocations ?? [])
    if (r.discardIncompleteState) {
      const old = existing.get(r.address);
      const attributes = old?.instance.attributes;
      if (
        !old ||
        old.resource.mode !== "managed" ||
        !attributes ||
        !recoveryCredentialIncomplete(r.address, attributes) ||
        attributes.project_id !== r.projectId ||
        (r.kind === "service-account-key"
          ? r.address !==
              "module.application.stackit_service_account_key.automation" ||
            attributes.key_id !== r.keyId ||
            attributes.service_account_email !== r.accountEmail
          : r.address !==
              "module.application.stackit_objectstorage_credential.this" ||
            attributes.credential_id !== r.keyId ||
            attributes.credentials_group_id !== r.groupId)
      )
        throw new Error("checkpoint-changed");
      removals.add(r.address);
    }
  for (const [address, old] of existing) {
    if (removals.has(address)) {
      if (current.has(address)) throw new Error("checkpoint-changed");
      continue;
    }
    const retained = current.get(address);
    if (
      !retained ||
      imports.has(address) ||
      canonical(old.instance) !== canonical(retained.instance) ||
      old.resource.provider !== retained.resource.provider ||
      old.resource.mode !== retained.resource.mode
    )
      throw new Error("checkpoint-changed");
  }
  for (const [address, item] of imports) {
    const added = current.get(address);
    if (
      !added ||
      added.resource.mode !== "managed" ||
      added.resource.type !== item.type ||
      added.instance.attributes.id !== item.resourceId
    )
      throw new Error("checkpoint-changed");
  }
  const newData = after.instances.filter(
    (i) => !existing.has(i.address) && !imports.has(i.address),
  );
  if (
    newData.some(
      (i) =>
        i.resource.mode !== "data" ||
        i.address !==
          "module.application.data.stackit_network_area_region.defaults[0]" ||
        i.resource.type !== "stackit_network_area_region",
    )
  )
    throw new Error("checkpoint-changed");
  if (
    current.size !==
    existing.size - removals.size + imports.size + newData.length
  )
    throw new Error("checkpoint-changed");
  // Imports must not silently rewrite root outputs or other global State fields.
  const global = (s: typeof before.state) => {
    const { resources: _r, serial: _s, terraform_version: _v, ...rest } = s;
    return rest;
  };
  if (canonical(global(before.state)) !== canonical(global(after.state)))
    throw new Error("checkpoint-changed");
  return {
    originalStateSha256: before.sha256,
    candidateStateSha256: after.sha256,
    originalSerial: before.state.serial,
    candidateSerial: after.state.serial,
    retainedResources: existing.size - removals.size,
    candidateResources: current.size,
  };
}

/** A diagnostic preview cannot authorize an infrastructure Apply. */
export function verifyRecoveryPreview(
  value: unknown,
  candidate: Buffer,
  instanceId: string,
) {
  const plan = z
    .object({
      resource_changes: z
        .array(
          z.object({
            address: z.string(),
            mode: z.enum(["managed", "data"]),
            change: z.object({ actions: z.array(z.string()).min(1).max(2) }),
          }),
        )
        .max(2000)
        .default([]),
    })
    .parse(value);
  const retained = readRecoveryState(candidate, instanceId).instances.filter(
    (i) => i.resource.mode === "managed",
  );
  const counts = { create: 0, unchanged: 0, update: 0, delete: 0, replace: 0 };
  const seen = new Set<string>();
  for (const r of plan.resource_changes) {
    if (seen.has(r.address)) throw new Error("unexpected-plan-change");
    seen.add(r.address);
    if (r.mode === "data" && canonical(r.change.actions) === '["read"]')
      continue;
    const actions = canonical(r.change.actions);
    if (actions === '["no-op"]') counts.unchanged++;
    else if (actions === '["create"]') counts.create++;
    else throw new Error("unexpected-plan-change");
  }
  for (const old of retained) {
    const change = plan.resource_changes.find((i) => i.address === old.address);
    if (!change || canonical(change.change.actions) !== '["no-op"]')
      throw new Error("unexpected-plan-change");
  }
  return counts;
}

/** Templates generate private credentials; an ID-only checkpoint is not usable
 * credential material. Only these two exact resource addresses may be discarded
 * after explicit approval; no arbitrary State removal is accepted. */
export function recoveryCredentialIncomplete(
  address: string,
  attributes: Record<string, unknown>,
) {
  if (address === "module.application.stackit_objectstorage_credential.this")
    return (
      typeof attributes.secret_access_key !== "string" ||
      !attributes.secret_access_key ||
      typeof attributes.access_key !== "string" ||
      !attributes.access_key
    );
  if (address === "module.application.stackit_service_account_key.automation") {
    try {
      if (typeof attributes.json !== "string") return true;
      const key = JSON.parse(attributes.json);
      return (
        typeof key?.credentials?.privateKey !== "string" ||
        !key.credentials.privateKey
      );
    } catch {
      return true;
    }
  }
  return false;
}
