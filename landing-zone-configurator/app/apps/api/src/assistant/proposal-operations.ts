import {
  applicationProjectPermissionNames,
  applicationServiceAccountKeyPermissions,
  defaultApplicationAccessProfile,
  type JsonValue,
  objectValue,
  type ProjectTemplateDraft,
  previewApplicationAccessTransition,
} from "@lzc/domain";

export type ConsultationChange = {
  path: string;
  operation:
    | "merge"
    | "replace"
    | "default"
    | "union"
    | "preset"
    | "add_permissions";
  value: JsonValue;
};

export const consultationAccessPresets = [
  "application-workloads-v1",
  "application-vm-v1",
  "owner",
] as const;

export class ConsultationOperationError extends Error {
  constructor(
    code: string,
    readonly path: string,
    readonly instruction: string,
  ) {
    super(code);
  }
}
/** Typed local transformations, not language/intent routing. Materialise complete
 * native values before the existing source, schema and compiler checks. */
export function materializeConsultationChanges(
  changes: ConsultationChange[],
  current: Record<string, unknown>,
): (Omit<ConsultationChange, "operation"> & {
  operation: "merge" | "replace" | "default";
})[] {
  const working = structuredClone(current);
  let replacedTemplateAccess = false;
  const merge = (left: JsonValue, right: JsonValue): JsonValue => {
    if (!right || typeof right !== "object" || Array.isArray(right))
      return right;
    const result = { ...objectValue(left) };
    for (const [key, value] of Object.entries(right)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("assistant_invalid_scope");
      result[key] =
        key === "accessProfile"
          ? structuredClone(value)
          : merge(result[key] ?? null, value);
    }
    return result;
  };
  const expanded = changes.map((change) => {
    const segments = change.path.split(".");
    if (
      segments.some(
        (key) =>
          !key || ["__proto__", "constructor", "prototype"].includes(key),
      )
    )
      throw new Error("assistant_invalid_scope");
    const root = segments.shift()!;
    const read = (keys: string[]) =>
      keys.reduce<unknown>(
        (value, key) => objectValue(value as JsonValue)[key],
        working[root],
      );
    if (change.operation === "add_permissions") {
      const selection = objectValue(change.value);
      const keys = selection.templateKeys;
      const principals = selection.principals;
      const source = objectValue(selection.source);
      const services = source.kind === "services" ? source.ids : [];
      const sets = source.kind === "permission_set" ? [source.id] : [];
      const explicit = source.kind === "permissions" ? source.ids : [];
      if (
        root !== "projectTemplates" ||
        segments.length ||
        !Array.isArray(keys) ||
        !keys.length ||
        !Array.isArray(principals) ||
        !principals.length ||
        !Array.isArray(services) ||
        !Array.isArray(sets) ||
        !Array.isArray(explicit)
      )
        throw new Error("assistant_invalid_permission_operation");
      if (
        principals.some(
          (principal) =>
            !["requester", "automation"].includes(String(principal)),
        ) ||
        sets.some((set) => set !== "service-account-keys") ||
        explicit.some(
          (permission) =>
            !applicationProjectPermissionNames.includes(String(permission)),
        )
      )
        throw new Error("assistant_unknown_permission_selection");
      if (!services.length && !sets.length && !explicit.length)
        throw new Error("assistant_permission_selection_required");
      if (services.includes("iam"))
        throw new Error("assistant_explicit_iam_permissions_required");
      if (
        services.some(
          (service) =>
            typeof service !== "string" ||
            !applicationProjectPermissionNames.some((name) =>
              name.startsWith(`${service}.`),
            ),
        )
      )
        throw new Error("assistant_unknown_permission_service");
      const expanded: ConsultationChange[] = [];
      for (const key of keys) {
        if (
          typeof key !== "string" ||
          !objectValue(working.projectTemplates as JsonValue)[key]
        )
          throw new Error("assistant_existing_template_required");
        for (const principal of principals) {
          if (
            objectValue(read([key, "accessProfile"]) as JsonValue).mode ===
            "owner"
          )
            throw new ConsultationOperationError(
              "assistant_existing_owner_covers_permissions",
              `projectTemplates.${key}.accessProfile`,
              "The observed template already has the explicit full Owner profile for requester AND automation. It includes the requested catalogued project permissions. Do not replace/narrow it merely to add rights it already declares. Explain that no permission-profile change is needed, preserving this template; other selected granular templates may still need additions. This describes the template policy, not verified live IAM, service entitlement, networking or deployment.",
            );
          if (
            objectValue(read([key, "accessProfile"]) as JsonValue).mode !==
            "granular"
          )
            throw new ConsultationOperationError(
              "assistant_granular_profile_required",
              `projectTemplates.${key}.accessProfile`,
              "This template has no granular permission lists. Inspect its actual access profile and legacy access settings. Do not silently convert legacy/Owner access. Explain the transition to a complete registered profile and obtain the missing user decision; propose_template_access_profile supports replaceLegacyAccess=true only for a confirmed legacy transition.",
            );
          const path = `projectTemplates.${key}.accessProfile.${principal === "requester" ? "permissions" : "automationPermissions"}`;
          if (services.length)
            expanded.push({
              path,
              operation: "union",
              value: { catalogueServices: services },
            });
          const names = [
            ...explicit,
            ...(sets.includes("service-account-keys")
              ? applicationServiceAccountKeyPermissions
              : []),
          ];
          if (names.length)
            expanded.push({ path, operation: "union", value: names });
        }
      }
      const result = materializeConsultationChanges(expanded, working);
      const patch = result.reduce<JsonValue>(
        (value, entry) => merge(value, entry.value),
        {},
      );
      working.projectTemplates = merge(
        (working.projectTemplates ?? {}) as JsonValue,
        patch,
      );
      return { path: root, operation: "merge" as const, value: patch };
    }
    if (change.operation !== "union" && change.operation !== "preset") {
      if (change.operation === "merge" && root === "projectTemplates") {
        const profiles: [string, JsonValue | undefined][] = !segments.length
          ? Object.entries(objectValue(change.value)).map(([key, value]) => [
              key,
              objectValue(value).accessProfile,
            ])
          : [
              [
                segments[0]!,
                segments[1] === "accessProfile"
                  ? segments.length > 2
                    ? { [segments[2]!]: change.value }
                    : change.value
                  : objectValue(change.value).accessProfile,
              ],
            ];
        for (const [key, proposedProfile] of profiles) {
          const priorProfile = objectValue(
            read([key, "accessProfile"]) as JsonValue,
          );
          if (
            proposedProfile &&
            ["permissions", "automationPermissions"].some(
              (field) =>
                Array.isArray(priorProfile[field]) &&
                objectValue(proposedProfile)[field] !== undefined &&
                JSON.stringify(priorProfile[field]) !==
                  JSON.stringify(objectValue(proposedProfile)[field]),
            )
          )
            throw new ConsultationOperationError(
              "assistant_use_typed_array_operation",
              change.path,
              "For additions, use operation=union at the exact permissions or automationPermissions ARRAY path. Each principal retains its own existing rights; do not copy one principal's array to the other. For a deliberate replacement use operation=replace at the exact array/profile path. For a registered standard profile use operation=preset.",
            );
        }
      }
      if (root !== "projectTemplates" || !segments.length) {
        if (root === "projectTemplates")
          working[root] =
            change.operation === "merge"
              ? merge((working[root] ?? {}) as JsonValue, change.value)
              : structuredClone(change.value);
        return { ...change, operation: change.operation };
      }
      if (change.operation === "default")
        throw new Error("assistant_use_registered_preset");
      if (!objectValue(working[root] as JsonValue)[segments[0]!])
        throw new Error("assistant_existing_template_required");
      let keys = segments;
      let value = change.value;
      if (segments[1] === "accessProfile") {
        const profilePath = segments.slice(0, 2);
        const previous = read(profilePath) as JsonValue;
        if (segments.length > 2) {
          value = { ...objectValue(previous), [segments[2]!]: value };
          keys = profilePath;
        } else if (change.operation === "merge") value = merge(previous, value);
      }
      let patch = value;
      for (const key of [...keys].reverse()) patch = { [key]: patch };
      working[root] = merge((working[root] ?? {}) as JsonValue, patch);
      return { path: root, operation: "merge" as const, value: patch };
    }
    let value: JsonValue;
    if (change.operation === "preset") {
      if (
        root !== "projectTemplates" ||
        segments.length !== 2 ||
        segments[1] !== "accessProfile" ||
        !objectValue(working[root] as JsonValue)[segments[0]!]
      )
        throw new Error("assistant_invalid_preset_path");
      const choice = objectValue(change.value);
      if (!consultationAccessPresets.some((id) => id === choice.id))
        throw new Error("assistant_unknown_preset");
      const existingTemplate = objectValue(read([segments[0]!]) as JsonValue);
      if (choice.replaceLegacyAccess === true) {
        const transition = previewApplicationAccessTransition(
          existingTemplate as unknown as ProjectTemplateDraft,
        );
        objectValue(working[root] as JsonValue)[segments[0]!] = {
          ...existingTemplate,
          ...transition.patch,
        } as JsonValue;
        replacedTemplateAccess = true;
      }
      if (choice.id === "owner") {
        if (choice.initialOwnerEmail !== undefined)
          throw new ConsultationOperationError(
            "assistant_owner_preset_parameter",
            change.path,
            "The owner profile has no initialOwnerEmail field. Use value={id:owner} for the explicitly requested full Owner profile; a separate initial owner is part of a granular profile.",
          );
        let patch: JsonValue = { schemaVersion: 1, mode: "owner" };
        for (const key of [...segments].reverse()) patch = { [key]: patch };
        objectValue(working[root] as JsonValue)[segments[0]!] = {
          ...objectValue(objectValue(working[root] as JsonValue)[segments[0]!]),
          accessProfile: { schemaVersion: 1, mode: "owner" },
        };
        return { path: root, operation: "merge" as const, value: patch };
      }
      const existingOwner = objectValue(
        read(segments) as JsonValue,
      ).initialOwnerEmail;
      const owner = choice.initialOwnerEmail ?? existingOwner;
      if (typeof owner !== "string" || !owner)
        throw new Error("assistant_owner_required");
      value = defaultApplicationAccessProfile(
        owner,
        choice.id === "application-vm-v1" ? "vm" : undefined,
      ) as JsonValue;
    } else {
      const prior = read(segments);
      if (!Array.isArray(prior))
        throw new ConsultationOperationError(
          "assistant_union_requires_existing_array",
          change.path,
          root === "projectTemplates"
            ? "Union targets an existing permissions ARRAY: projectTemplates.KEY.accessProfile.permissions or projectTemplates.KEY.accessProfile.automationPermissions. The accessProfile itself is an object, not an array. Read projectTemplates to obtain the exact existing key and arrays."
            : "Union targets an existing array. Read the actual field schema and current value before choosing the array path.",
        );
      let additions: JsonValue[];
      if (Array.isArray(change.value)) additions = change.value;
      else {
        const selection = objectValue(change.value);
        if (
          root !== "projectTemplates" ||
          !["permissions", "automationPermissions"].includes(
            segments.at(-1) ?? "",
          ) ||
          !Array.isArray(selection.catalogueServices) ||
          !selection.catalogueServices.length
        )
          throw new Error("assistant_invalid_union_selection");
        const services = selection.catalogueServices;
        if (services.includes("iam"))
          throw new Error("assistant_explicit_iam_permissions_required");
        if (
          services.some(
            (service) =>
              typeof service !== "string" ||
              !applicationProjectPermissionNames.some((permission) =>
                permission.startsWith(`${service}.`),
              ),
          )
        )
          throw new Error("assistant_unknown_permission_service");
        additions = applicationProjectPermissionNames.filter((permission) =>
          services.includes(permission.split(".")[0]!),
        );
      }
      value = [
        ...new Map(
          [...prior, ...additions].map((item) => [JSON.stringify(item), item]),
        ).values(),
      ] as JsonValue;
    }
    // Access profiles are atomic domain values: retain their mode, owner and the
    // other principal's rights when updating one permission set.
    let keys = segments;
    if (
      root === "projectTemplates" &&
      segments[1] === "accessProfile" &&
      segments.length > 2
    ) {
      value = {
        ...objectValue(read(segments.slice(0, 2)) as JsonValue),
        [segments[2]!]: value,
      };
      keys = segments.slice(0, 2);
    }
    let patch: JsonValue = value;
    for (const key of [...keys].reverse()) patch = { [key]: patch };
    // Keep subsequent operations in this batch based on preceding local results.
    let target = objectValue(working[root] as JsonValue);
    for (const key of keys.slice(0, -1)) target = objectValue(target[key]);
    target[keys.at(-1)!] = value;
    return { path: root, operation: "merge" as const, value: patch };
  });
  const combined = new Map<string, (typeof expanded)[number]>();
  for (const change of expanded) {
    const prior = combined.get(change.path);
    if (!prior) combined.set(change.path, change);
    else if (prior.operation === "merge" && change.operation === "merge")
      combined.set(change.path, {
        ...change,
        value: merge(prior.value, change.value),
      });
    else throw new Error("assistant_conflicting_operations");
  }
  if (replacedTemplateAccess)
    combined.set("projectTemplates", {
      path: "projectTemplates",
      operation: "replace",
      value: working.projectTemplates as JsonValue,
    });
  return [...combined.values()];
}
