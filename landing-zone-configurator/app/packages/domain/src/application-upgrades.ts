import { z } from "zod";
import { resolveApplicationAccessProfile } from "./application-access.js";
import {
  applicationPlanScopeIssues,
  publishedProjectTemplateSchema,
} from "./application-catalogue.js";
import { platformContractSchema } from "./application-plan.js";
import { assertBoundedJson } from "./features.js";
import { resolveTemplateParameters } from "./template-parameters.js";

type Classification = "ordinary" | "sensitive" | "blocked";
type Reason = { code: string; path: string; classification: Classification };
type Json = z.infer<ReturnType<typeof z.json>>;
const record = z.record(z.string(), z.json());
const policy = z.enum(["approval-required", "direct"]);
const canonical = (value: unknown): string =>
  JSON.stringify(
    value === undefined
      ? null
      : Array.isArray(value)
        ? value.map((v) => JSON.parse(canonical(v)))
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, JSON.parse(canonical(v))]),
            )
          : value,
  );
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const get = (value: Record<string, Json>, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (v, k) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as Record<string, unknown>)[k]
          : undefined,
      value,
    );
const classification = (reasons: Reason[]): Classification =>
  reasons.some((r) => r.classification === "blocked")
    ? "blocked"
    : reasons.some((r) => r.classification === "sensitive")
      ? "sensitive"
      : "ordinary";
function targetChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  add: (code: string, path: string, severity: Classification) => void,
) {
  for (const [field, code] of [
    ["folder_id", "parent-container-migration"],
    ["region", "region-migration"],
    ["corporate", "network-mode-migration"],
    ["network_area_id", "network-area-migration"],
  ])
    if (field && !same(before[field], after[field]))
      add(code ?? "target-migration", `target.${field}`, "blocked");
  for (const field of ["firewall_next_hop_ip", "ipv4_nameservers"])
    if (!same(before[field], after[field]))
      add("platform-network-change", `target.${field}`, "sensitive");
}
/** Assess immutable versions against the durable current settings, never mutate an order or State. */
export function assessApplicationTemplateUpgrade(input: {
  current: unknown;
  target: unknown;
  currentSettings: unknown;
  parameters: unknown;
  requestedParameters?: unknown;
  verifiedStackitEmail: string;
  currentPlatform: unknown;
  targetPlatform: unknown;
  currentBackendIdentity: string;
  targetBackendIdentity: string;
  edgePolicy?: { sensitive: "approval-required" | "direct" };
  currentPlatformRevision?: string;
}) {
  assertBoundedJson({
    ...input,
    requestedParameters: input.requestedParameters ?? {},
    edgePolicy: input.edgePolicy ?? { sensitive: "approval-required" },
    currentPlatformRevision: input.currentPlatformRevision ?? null,
  });
  const current = publishedProjectTemplateSchema.parse(input.current),
    target = publishedProjectTemplateSchema.parse(input.target);
  const beforePlatform = platformContractSchema.parse(input.currentPlatform),
    afterPlatform = platformContractSchema.parse(input.targetPlatform);
  const currentSettings = record.parse(input.currentSettings),
    parameters = record.parse(input.parameters),
    requested = record.parse(input.requestedParameters ?? {});
  const retainedParameters = {
    ...structuredClone(parameters),
    ...structuredClone(requested),
  };
  const reasons: Reason[] = [],
    requiredParameters: {
      path: string;
      required: boolean;
      hasDefault: boolean;
    }[] = [];
  const add = (code: string, path: string, severity: Classification) =>
    reasons.push({ code, path, classification: severity });
  for (const path of Object.keys(retainedParameters)) {
    if (
      path === "observability.acl" ||
      target.template.parameterPolicy?.fields[path]?.source !== "input"
    )
      add("parameter-not-accepted", `parameters.${path}`, "blocked");
  }
  if (
    current.tenantId !== target.tenantId ||
    beforePlatform.tenant_id !== current.tenantId ||
    afterPlatform.tenant_id !== current.tenantId
  )
    add("tenant-migration", "tenantId", "blocked");
  if (
    current.templateId !== target.templateId ||
    current.template.id !== target.template.id
  )
    add("template-family-changed", "templateId", "blocked");
  if (target.id === current.id || target.version <= current.version)
    add("target-version-not-newer", "version", "blocked");
  if (target.retiredAt) add("target-version-retired", "retiredAt", "blocked");
  if (target.template.kind === "sandbox")
    add("target-kind-unavailable", "kind", "blocked");
  if (
    (input.currentPlatformRevision ?? current.platformRevision) !==
      beforePlatform.revision ||
    target.platformRevision !== afterPlatform.revision
  )
    add("platform-contract-mismatch", "platformRevision", "blocked");
  if (beforePlatform.organization_id !== afterPlatform.organization_id)
    add("organization-migration", "organizationId", "blocked");
  if (
    input.currentBackendIdentity !== input.targetBackendIdentity ||
    !input.currentBackendIdentity
  )
    add("state-backend-migration", "stateBackend", "blocked");
  if (current.template.kind !== target.template.kind)
    add("network-mode-migration", "kind", "blocked");
  if (current.template.region !== target.template.region)
    add("region-migration", "region", "blocked");
  const beforeTarget = current.targetKey
      ? beforePlatform.targets[current.targetKey]
      : undefined,
    afterTarget = target.targetKey
      ? afterPlatform.targets[target.targetKey]
      : undefined;
  if (!beforeTarget || !afterTarget)
    add("platform-target-unavailable", "targetKey", "blocked");
  else targetChanges(beforeTarget, afterTarget, add);
  if (
    Object.keys(target.template.namespaceServices ?? {}).length ||
    Object.keys(current.template.namespaceServices ?? {}).length
  )
    add("namespace-upgrade-unavailable", "namespaceServices", "blocked");
  for (const [path, source] of Object.entries(
    target.template.parameterPolicy?.fields ?? {},
  )) {
    if (source.source !== "input") continue;
    if (!Object.hasOwn(retainedParameters, path)) {
      const oldValue = get(currentSettings, path);
      if (oldValue !== undefined)
        retainedParameters[path] = structuredClone(oldValue) as Json;
      else {
        requiredParameters.push({
          path,
          required: source.required ?? false,
          hasDefault: source.default !== undefined,
        });
        add("parameter-confirmation-required", `parameters.${path}`, "blocked");
      }
    }
  }
  let targetSettings: Record<string, Json> = {};
  try {
    // Verify stored original parameters still belong to their publication. Resolve
    // the target using the retained decisions; never discard a removed field.
    resolveTemplateParameters(current.template, parameters, {
      verifiedStackitEmail: input.verifiedStackitEmail,
    });
    const resolved = resolveTemplateParameters(
      target.template,
      retainedParameters,
      { verifiedStackitEmail: input.verifiedStackitEmail },
    );
    targetSettings = resolveApplicationAccessProfile(
      target.template.accessProfile,
      resolved.settings,
      input.verifiedStackitEmail,
    );
    if (resolved.qualificationBlockers.length || resolved.bindings.length)
      add("target-not-qualified", "parameters", "blocked");
    if (
      applicationPlanScopeIssues(
        target.template,
        targetSettings,
        target.acceleratorRevision,
      ).length
    )
      add("target-source-not-qualified", "acceleratorRevision", "blocked");
  } catch {
    add("parameters-not-compatible", "parameters", "blocked");
  }
  if (Object.keys(targetSettings).length) {
    // These instance identities are not editable template fields. Preserve them
    // in the proposal instead of dropping the durable owner/project metadata.
    for (const key of [
      "owner_email",
      "naming_pattern",
      "project_name",
      "project_id",
      "project_code",
      "bucket_naming",
    ]) {
      if (
        Object.hasOwn(currentSettings, key) &&
        !Object.hasOwn(targetSettings, key)
      )
        targetSettings[key] = structuredClone(currentSettings[key]) as Json;
    }
    if (
      currentSettings.owner_email !== undefined &&
      currentSettings.owner_email !== input.verifiedStackitEmail
    )
      add("instance-identity-change", "settings.owner_email", "blocked");
    for (const path of [
      "owner_email",
      "initial_owner_email",
      "env",
      "naming_pattern",
      "project_name",
      "project_id",
      "project_code",
      "bucket_naming",
    ])
      if (!same(get(currentSettings, path), get(targetSettings, path)))
        add("instance-identity-change", `settings.${path}`, "blocked");
    for (const path of [
      "network_enabled",
      "secretsmanager_enabled",
      "observability.enabled",
    ])
      if (
        get(currentSettings, path) === true &&
        get(targetSettings, path) !== true
      )
        add("component-removal", `settings.${path}`, "blocked");
    const keys = new Set([
      ...Object.keys(currentSettings),
      ...Object.keys(targetSettings),
    ]);
    for (const key of keys) {
      if (same(currentSettings[key], targetSettings[key])) continue;
      if (
        [
          "owner_email",
          "initial_owner_email",
          "env",
          "naming_pattern",
          "project_name",
          "project_id",
          "project_code",
          "bucket_naming",
        ].includes(key)
      )
        continue;
      if (["custom_roles", "role_assignments", "automation_role"].includes(key))
        add("iam-change", `settings.${key}`, "sensitive");
      else if (["network_enabled", "network_prefix_length"].includes(key))
        add("network-change", `settings.${key}`, "blocked");
      else if (key === "ipv4_nameservers")
        add("network-change", `settings.${key}`, "sensitive");
      else if (/key|credential|rotation/.test(key))
        add("key-change", `settings.${key}`, "sensitive");
      else if (["observability", "secretsmanager_enabled"].includes(key))
        add("service-change", `settings.${key}`, "sensitive");
      else add("unknown-setting-change", `settings.${key}`, "blocked");
    }
  }
  if (current.acceleratorRevision !== target.acceleratorRevision)
    add("execution-source-change", "acceleratorRevision", "sensitive");
  const level = classification(reasons);
  const bothDirect =
    policy.parse(current.deploymentPolicy ?? "approval-required") ===
      "direct" &&
    policy.parse(target.deploymentPolicy ?? "approval-required") === "direct";
  return {
    classification: level,
    reasons,
    approvalPolicy:
      bothDirect &&
      (level !== "sensitive" || input.edgePolicy?.sensitive === "direct")
        ? ("direct" as const)
        : ("approval-required" as const),
    retainedParameters,
    targetSettings,
    requiredParameters,
    requiresFreshPlan: true as const,
    applyAllowed: false as const,
  };
}

/** A shared Platform Apply changes shared resources immediately, not per Application. */
export function assessPlatformDependencyImpact(input: {
  before: unknown;
  after: unknown;
  dependencies: readonly { instanceId: string; targetKey: string }[];
}) {
  assertBoundedJson(input);
  const before = platformContractSchema.parse(input.before),
    after = platformContractSchema.parse(input.after);
  const dependencies = z
    .array(
      z.strictObject({
        instanceId: z.uuid(),
        targetKey: z.string().min(1).max(48),
      }),
    )
    .max(10000)
    .parse(input.dependencies);
  const affected: {
    instanceId: string;
    targetKey: string;
    classification: Classification;
    reasons: Reason[];
  }[] = [];
  for (const dependency of dependencies) {
    const reasons: Reason[] = [],
      add = (code: string, path: string, severity: Classification) =>
        reasons.push({ code, path, classification: severity });
    if (before.tenant_id !== after.tenant_id)
      add("tenant-migration", "tenantId", "blocked");
    if (before.organization_id !== after.organization_id)
      add("organization-migration", "organizationId", "blocked");
    const oldTarget = before.targets[dependency.targetKey],
      newTarget = after.targets[dependency.targetKey];
    if (!oldTarget || !newTarget)
      add("platform-target-removal", "targetKey", "blocked");
    else targetChanges(oldTarget, newTarget, add);
    if (reasons.length)
      affected.push({
        ...dependency,
        classification: classification(reasons),
        reasons,
      });
  }
  return {
    classification: classification(affected.flatMap((a) => a.reasons)),
    affected,
    scannedDependencies: dependencies.length,
    sharedResourcesChangeImmediately: true as const,
    perApplicationIsolation: false as const,
  };
}

/** Rebind the same immutable publication to a compatible actual Platform contract. */
export function assessApplicationPlatformUpgrade(
  input: Omit<Parameters<typeof assessApplicationTemplateUpgrade>[0], "target">,
) {
  assertBoundedJson({
    ...input,
    requestedParameters: input.requestedParameters ?? {},
    edgePolicy: input.edgePolicy ?? { sensitive: "approval-required" },
    currentPlatformRevision: input.currentPlatformRevision ?? null,
  });
  const current = publishedProjectTemplateSchema.parse(input.current),
    before = platformContractSchema.parse(input.currentPlatform),
    after = platformContractSchema.parse(input.targetPlatform);
  const currentSettings = record.parse(input.currentSettings),
    parameters = record.parse(input.parameters);
  const reasons: Reason[] = [],
    add = (code: string, path: string, severity: Classification) =>
      reasons.push({ code, path, classification: severity });
  if (
    current.tenantId !== before.tenant_id ||
    before.tenant_id !== after.tenant_id
  )
    add("tenant-migration", "tenantId", "blocked");
  if (
    (input.currentPlatformRevision ?? current.platformRevision) !==
    before.revision
  )
    add("platform-contract-mismatch", "platformRevision", "blocked");
  if (before.revision === after.revision)
    add("target-contract-not-newer", "platformRevision", "blocked");
  if (before.organization_id !== after.organization_id)
    add("organization-migration", "organizationId", "blocked");
  if (
    input.currentBackendIdentity !== input.targetBackendIdentity ||
    !input.currentBackendIdentity
  )
    add("state-backend-migration", "stateBackend", "blocked");
  if (
    !same(input.requestedParameters ?? {}, {}) &&
    !same(input.requestedParameters, parameters)
  )
    add("platform-upgrade-parameters-changed", "parameters", "blocked");
  if (
    currentSettings.owner_email !== undefined &&
    currentSettings.owner_email !== input.verifiedStackitEmail
  )
    add("instance-identity-change", "settings.owner_email", "blocked");
  const oldTarget = current.targetKey
      ? before.targets[current.targetKey]
      : undefined,
    newTarget = current.targetKey
      ? after.targets[current.targetKey]
      : undefined;
  if (!oldTarget || !newTarget)
    add("platform-target-unavailable", "targetKey", "blocked");
  else targetChanges(oldTarget, newTarget, add);
  const level = classification(reasons),
    direct =
      current.deploymentPolicy === "direct" &&
      (level !== "sensitive" || input.edgePolicy?.sensitive === "direct");
  return {
    classification: level,
    reasons,
    approvalPolicy: direct
      ? ("direct" as const)
      : ("approval-required" as const),
    retainedParameters: structuredClone(parameters),
    targetSettings: structuredClone(currentSettings),
    requiredParameters: [],
    requiresFreshPlan: true as const,
    applyAllowed: false as const,
  };
}
