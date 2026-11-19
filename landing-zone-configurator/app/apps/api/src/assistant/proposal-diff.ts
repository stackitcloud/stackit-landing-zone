import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { defaultApplicationAccessProfile } from "@lzc/domain";
import {
  type ConsultationChange,
  consultationAccessPresets,
} from "./proposal-operations.js";

export type ProposalDelta = {
  path: string;
  before?: unknown;
  after?: unknown;
  added?: unknown[];
  removed?: unknown[];
  addedGroups?: Record<string, number>;
  removedGroups?: Record<string, number>;
};

/** Relevant readiness without copying unchanged owner identities into review. */
export function consultationTemplateReadiness(values: Record<string, unknown>) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.entries(object(values.projectTemplates)).map(([key, value]) => {
    const template = object(value),
      profile = object(template.accessProfile),
      settings = object(template.settings);
    const hasInitialOwner =
      typeof profile.initialOwnerEmail === "string" &&
      profile.initialOwnerEmail.trim().length > 0;
    return {
      key,
      name: template.name,
      kind: template.kind,
      accessProfileMode: profile.mode ?? "legacy",
      hasInitialOwner,
      requiresInitialOwnerBeforePublication:
        profile.mode === "granular" && !hasInitialOwner,
      legacyInputs: [
        "automation_role",
        "custom_roles",
        "role_assignments",
        "initial_owner_email",
      ].filter((field) => settings[field] !== undefined),
      legacyRoleParameter:
        object(object(template.parameterPolicy).fields).role_assignments !==
        undefined,
    };
  });
}

/** Publication prerequisites are sourced from actual affected profile values,
 * not from a language classifier or an unrelated incomplete template. */
export function consultationPublicationDecisions(
  readiness: ReturnType<typeof consultationTemplateReadiness>,
  delta: ProposalDelta[],
) {
  const templateKeys = readiness
    .filter(
      (template) =>
        template.requiresInitialOwnerBeforePublication &&
        delta.some((change) =>
          change.path.startsWith(
            `projectTemplates.${template.key}.accessProfile`,
          ),
        ),
    )
    .map((template) => template.key);
  return templateKeys.length
    ? [
        {
          id: "template-initial-owner",
          path: "projectTemplates",
          templateKeys,
          requirement:
            "One shared central initial-owner decision for the affected granular profiles. Ask one structured question while preserving valid independent draft changes, or cite an explicit USER deferral. An inline question or a publication notice alone does not expose an interactive decision.",
        },
      ]
    : [];
}

/** Compact only exact, server-materialized catalogue transformations. Explicit
 * custom lists and any mismatching compiler output retain the complete delta. */
export function consultationCompilerEvidence(
  candidate: Record<string, unknown>,
  operations: ConsultationChange[],
  materialized: ConsultationChange[],
  delta: ProposalDelta[],
) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const normalized = (value: unknown) => {
    const profile = { ...object(value) };
    for (const key of ["permissions", "automationPermissions"])
      if (Array.isArray(profile[key]))
        profile[key] = [...(profile[key] as unknown[])].sort();
    return profile;
  };
  const expectedTemplates = Object.assign(
    {},
    ...materialized
      .filter(
        (change) =>
          change.path === "projectTemplates" && change.operation === "merge",
      )
      .map((change) => object(change.value)),
  ) as Record<string, unknown>;
  const actualTemplates = object(candidate.projectTemplates);
  const verifiedOperations: {
    kind: string;
    source: unknown;
    templates: string[];
    principals: string[];
  }[] = [];
  const covered = new Map<string, number>();
  const seen = new Set<string>();
  for (const change of operations) {
    const value = object(change.value);
    let keys: string[], principals: string[], source: unknown, kind: string;
    const preset = /^projectTemplates\.([^.]+)\.accessProfile$/.exec(
      change.path,
    );
    if (
      change.operation === "preset" &&
      preset &&
      consultationAccessPresets.includes(
        value.id as (typeof consultationAccessPresets)[number],
      )
    ) {
      keys = [preset[1]!];
      principals = ["requester", "automation"];
      kind = "registered-preset";
      source = value.id;
    } else if (
      change.path === "projectTemplates" &&
      change.operation === "add_permissions" &&
      ["services", "permission_set"].includes(
        String(object(value.source).kind),
      ) &&
      Array.isArray(value.templateKeys) &&
      Array.isArray(value.principals)
    ) {
      keys = value.templateKeys as string[];
      principals = value.principals as string[];
      kind = "catalogue-union";
      source = value.source;
    } else return { compilerDelta: delta, verifiedOperations: [] };
    // Overlapping batches require full review of their ordering and effects.
    if (
      !keys.length ||
      !principals.length ||
      new Set(keys).size !== keys.length ||
      principals.some(
        (principal) => !["requester", "automation"].includes(principal),
      ) ||
      keys.some(
        (key) => typeof key !== "string" || key.includes(".") || seen.has(key),
      )
    )
      return { compilerDelta: delta, verifiedOperations: [] };
    for (const key of keys) seen.add(key);
    const matches = keys.every((key) => {
      const actual = object(object(actualTemplates[key]).accessProfile);
      const expected =
        kind === "registered-preset"
          ? source === "owner"
            ? { schemaVersion: 1, mode: "owner" }
            : defaultApplicationAccessProfile(
                String(
                  value.initialOwnerEmail ??
                    object(object(expectedTemplates[key]).accessProfile)
                      .initialOwnerEmail ??
                    "",
                ),
                source === "application-vm-v1" ? "vm" : "workload",
              )
          : object(object(expectedTemplates[key]).accessProfile);
      return (
        Object.keys(expected).length > 0 &&
        isDeepStrictEqual(normalized(actual), normalized(expected))
      );
    });
    if (!matches) continue;
    const index = verifiedOperations.length;
    verifiedOperations.push({ kind, source, templates: keys, principals });
    for (const key of keys)
      for (const principal of principals)
        covered.set(
          `projectTemplates.${key}.accessProfile.${principal === "requester" ? "permissions" : "automationPermissions"}`,
          index,
        );
  }
  return {
    verifiedOperations,
    compilerDelta: delta.map((entry) => {
      const operation = covered.get(entry.path);
      if (
        operation === undefined ||
        !entry.added ||
        !entry.removed ||
        entry.added.length + entry.removed.length <= 24
      )
        return entry;
      const { added, removed, ...rest } = entry;
      return {
        ...rest,
        addedCount: added.length,
        removedCount: removed.length,
        effectSha256: createHash("sha256")
          .update(JSON.stringify({ added, removed }))
          .digest("hex"),
        verifiedOperation: operation,
      };
    }),
  };
}
export type ConsultationCompilerEvidence = ReturnType<
  typeof consultationCompilerEvidence
>;

/** Compare compiler-produced PUBLIC values. Unchanged identities and access
 * metadata never enter the review; permission order is not a change of rights. */
export function consultationProposalDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ProposalDelta[] {
  const result: ProposalDelta[] = [];
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visit = (left: unknown, right: unknown, path: string) => {
    if (path.startsWith("assistant.") || isDeepStrictEqual(left, right)) return;
    if (Array.isArray(left) || Array.isArray(right)) {
      const prior = Array.isArray(left) ? left : [];
      const next = Array.isArray(right) ? right : [];
      const priorKeys = new Set(prior.map((value) => JSON.stringify(value)));
      const nextKeys = new Set(next.map((value) => JSON.stringify(value)));
      const added = next.filter(
        (value) => !priorKeys.has(JSON.stringify(value)),
      );
      const removed = prior.filter(
        (value) => !nextKeys.has(JSON.stringify(value)),
      );
      const permissionSet = /\.(permissions|automationPermissions)$/.test(path);
      if (permissionSet && !added.length && !removed.length) return;
      const groups = (values: unknown[]) =>
        values.reduce<Record<string, number>>((counts, value) => {
          if (typeof value === "string") {
            const product = value.split(".")[0]!;
            counts[product] = (counts[product] ?? 0) + 1;
          }
          return counts;
        }, {});
      result.push(
        permissionSet
          ? {
              path,
              added,
              removed,
              addedGroups: groups(added),
              removedGroups: groups(removed),
            }
          : { path, before: left, after: right, added, removed },
      );
      return;
    }
    if (Object.keys(object(left)).length || Object.keys(object(right)).length) {
      const previous = object(left),
        next = object(right);
      for (const key of new Set([
        ...Object.keys(previous),
        ...Object.keys(next),
      ]))
        visit(previous[key], next[key], path ? `${path}.${key}` : key);
    } else result.push({ path, before: left, after: right });
  };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const root = key.split(".")[0]!;
    if (
      key.includes(".") &&
      (Object.hasOwn(before, root) || Object.hasOwn(after, root))
    )
      continue;
    visit(before[key], after[key], key);
  }
  return result;
}
