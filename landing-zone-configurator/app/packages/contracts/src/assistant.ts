import { z } from "zod";

export const assistantInferenceFailureSchema = z.object({
  error: z.enum(["assistant_inference_failed", "assistant_unavailable"]),
  reason: z.enum([
    "requirements_unconfirmed",
    "proposal_invalid",
    "response_invalid",
    "response_truncated",
    "response_interrupted",
    "service_timeout",
    "service_busy",
    "service_authentication",
    "service_unavailable",
  ]),
  requestId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export const assistantDiscardRequestSchema = z.strictObject({
  conversationId: z.uuid(),
  revision: z.number().int().positive(),
});

export type AssistantFailureReason = z.infer<
  typeof assistantInferenceFailureSchema
>["reason"];

export type AssistantProposalChange = {
  path: string;
  value: unknown;
  operation?: "merge" | "replace" | "default" | undefined;
  before?: unknown;
  baselineAvailable?: boolean;
};

export type AssistantProposalField = {
  id: string;
  path: string;
  changePath: string;
  keys: string[];
  before: unknown;
  baselineAvailable?: boolean;
  value: unknown;
  operation?: "merge" | "replace" | "default" | undefined;
  removesEntry?: boolean;
};

export const assistantMergeConfirmationSchema = z.strictObject({
  error: z.literal("assistant_merge_confirmation_required"),
  configurationRevision: z.number().int().positive(),
  conflicts: z.array(
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("editor"), path: z.string() }),
      z.strictObject({
        kind: z.literal("proposal"),
        path: z.string(),
        before: z.unknown(),
        current: z.unknown(),
        value: z.unknown(),
        baselineAvailable: z.boolean(),
      }),
    ]),
  ),
});

export type AssistantMergeConflict = z.infer<
  typeof assistantMergeConfirmationSchema
>["conflicts"][number];

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

export function assistantValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function mergeAssistantDrafts(
  baseline: unknown,
  local: unknown,
  saved: unknown,
): { value: unknown; conflicts: AssistantMergeConflict[] } {
  const conflicts: AssistantMergeConflict[] = [];
  const merge = (
    before: unknown,
    edited: unknown,
    current: unknown,
    path: string[],
  ): unknown => {
    if (assistantValuesEqual(before, edited)) return current;
    if (
      assistantValuesEqual(before, current) ||
      assistantValuesEqual(edited, current)
    )
      return edited;
    if (
      [before, edited, current].every(
        (value) =>
          value !== null && typeof value === "object" && !Array.isArray(value),
      )
    ) {
      const records = [before, edited, current].map(
        (value) => new Map(entries(value)),
      );
      const keys = new Set(records.flatMap((record) => [...record.keys()]));
      return Object.fromEntries(
        [...keys]
          .map((key) => [
            key,
            merge(
              records[0]?.get(key),
              records[1]?.get(key),
              records[2]?.get(key),
              [...path, key],
            ),
          ])
          .filter(([, value]) => value !== undefined),
      );
    }
    conflicts.push({ kind: "editor", path: path.join(".") });
    return edited;
  };
  return { value: merge(baseline, local, saved, []), conflicts };
}

export function assistantProposalConflicts(
  fields: readonly AssistantProposalField[],
  values: Record<string, unknown>,
  baselineAvailable: (path: string) => boolean,
): AssistantMergeConflict[] {
  return fields.flatMap((field) => {
    const current =
      field.keys.reduce(
        child,
        assistantProposalValue(values, field.changePath),
      ) ?? null;
    const known = baselineAvailable(field.changePath);
    if (
      (known && assistantAdditiveField(field)) ||
      (field.operation !== "default" &&
        assistantValuesEqual(current, field.value ?? null)) ||
      (known && assistantValuesEqual(current, field.before))
    )
      return [];
    return [
      {
        kind: "proposal" as const,
        path: field.path,
        before: known ? field.before : null,
        current,
        value: field.value,
        baselineAvailable: known,
      },
    ];
  });
}

export function assistantAdditiveField(field: AssistantProposalField): boolean {
  return (
    !field.operation &&
    (["organization_owners", "organization_auditors"].includes(
      field.changePath,
    ) ||
      (field.changePath === "rm_folders" &&
        ["owner_emails", "reader_emails"].includes(field.keys.at(-1) ?? "")))
  );
}

function entries(value: unknown): [string, unknown][] {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : [];
}

function child(value: unknown, key: string): unknown {
  return entries(value).find(([name]) => name === key)?.[1];
}

export function assistantProposalValue(
  values: Record<string, unknown> | null,
  path: string,
): unknown {
  if (!values) return undefined;
  if (Object.hasOwn(values, path)) return values[path];
  const segments = path.split(".");
  for (let length = segments.length - 1; length > 0; length--) {
    const prefix = segments.slice(0, length).join(".");
    if (Object.hasOwn(values, prefix))
      return segments.slice(length).reduce(child, values[prefix]);
  }
  return undefined;
}

export function assistantProposalBaselineAvailable(
  values: Record<string, unknown> | null,
  path: string,
): boolean {
  return (
    values !== null &&
    path
      .split(".")
      .some((_, index, segments) =>
        Object.hasOwn(values, segments.slice(0, index + 1).join(".")),
      )
  );
}

export function assistantProposalFields(
  changes: readonly AssistantProposalChange[],
): AssistantProposalField[] {
  return changes.flatMap((change) => {
    if (collectionReplacement(change)) {
      const before = new Map(entries(change.before));
      const after = new Map(entries(change.value));
      return [...new Set([...before.keys(), ...after.keys()])].flatMap((key) =>
        before.has(key) === after.has(key) &&
        assistantValuesEqual(before.get(key), after.get(key))
          ? []
          : [
              {
                id: `${change.path}/${encodeURIComponent(key)}`,
                path: `${change.path}.${key}`,
                changePath: change.path,
                keys: [key],
                before: before.get(key) ?? null,
                value: after.get(key) ?? null,
                operation: "replace" as const,
                ...(!after.has(key) ? { removesEntry: true } : {}),
              },
            ],
      );
    }
    const depth = change.operation
      ? change.operation === "merge"
        ? Number.POSITIVE_INFINITY
        : 0
      : change.path === "connectivity.firewalls"
        ? 3
        : [
              "connectivity.firewall",
              "connectivity.dns_zones",
              "connectivity.network_areas",
              "rm_folders",
            ].includes(change.path)
          ? 2
          : change.path === "connectivity.network_area"
            ? 1
            : 0;
    const flatten = (
      value: unknown,
      before: unknown,
      keys: string[],
    ): AssistantProposalField[] => {
      if (
        change.operation === "merge" &&
        entries(value).length === 0 &&
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        before !== null &&
        typeof before === "object" &&
        !Array.isArray(before)
      )
        return [];
      // Access profiles are discriminated policies. Selecting only changed leaves
      // would drop their unchanged schema/mode/owner and create an invalid profile.
      const accessProfile =
        change.path === "projectTemplates" &&
        keys.length === 2 &&
        keys[1] === "accessProfile";
      if (!accessProfile && keys.length < depth && entries(value).length > 0)
        return entries(value).flatMap(([key, entry]) =>
          flatten(entry, child(before, key), [...keys, key]),
        );
      if (
        change.operation !== "default" &&
        assistantValuesEqual(before ?? null, value ?? null)
      )
        return [];
      return [
        {
          id: [change.path, ...keys.map(encodeURIComponent)].join("/"),
          path: [change.path, ...keys].join("."),
          changePath: change.path,
          keys,
          before: before ?? null,
          ...(change.baselineAvailable === false
            ? { baselineAvailable: false }
            : {}),
          value,
          ...(change.operation ? { operation: change.operation } : {}),
        },
      ];
    };
    return flatten(change.value, change.before, []);
  });
}

function collectionReplacement(change: AssistantProposalChange): boolean {
  return (
    change.operation === "replace" &&
    change.baselineAvailable !== false &&
    (change.path === "projectTemplates" ||
      /^(?:connectivity|connectivity_regions\.[^.]+)\.dns_zones$/.test(
        change.path,
      )) &&
    [change.before, change.value].every(
      (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    )
  );
}

export function selectAssistantProposalFields(
  changes: readonly AssistantProposalChange[],
  selected: readonly string[],
  currentValues?: Record<string, unknown>,
): AssistantProposalChange[] {
  const fields = assistantProposalFields(changes);
  if (
    selected.length === 0 ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !fields.some((field) => field.id === id))
  )
    throw new Error("assistant_invalid_selection");
  const result = new Map<string, AssistantProposalChange>();
  for (const field of fields.filter((entry) => selected.includes(entry.id))) {
    const change = changes.find((entry) => entry.path === field.changePath);
    if (change && collectionReplacement(change)) {
      const previous = result.get(field.changePath);
      const value = Object.fromEntries(
        entries(
          previous?.value ??
            (currentValues
              ? assistantProposalValue(currentValues, field.changePath)
              : change.before),
        ),
      );
      const key = field.keys[0];
      if (key === undefined) throw new Error("assistant_invalid_selection");
      if (field.removesEntry) delete value[key];
      else value[key] = field.value;
      result.set(field.changePath, {
        path: field.changePath,
        value,
        operation: "replace",
      });
      continue;
    }
    if (field.keys.length === 0) {
      result.set(field.changePath, {
        path: field.changePath,
        value: field.value,
        ...(field.operation ? { operation: field.operation } : {}),
      });
      continue;
    }
    const previous = result.get(field.changePath);
    const combined = Object.fromEntries(entries(previous?.value));
    let target = combined;
    for (const key of field.keys.slice(0, -1)) {
      const nested = Object.fromEntries(entries(target[key]));
      target[key] = nested;
      target = nested;
    }
    const last = field.keys.at(-1);
    if (last !== undefined) target[last] = field.value;
    result.set(field.changePath, {
      path: field.changePath,
      value: combined,
      ...(field.operation ? { operation: field.operation } : {}),
    });
  }
  return [...result.values()];
}
