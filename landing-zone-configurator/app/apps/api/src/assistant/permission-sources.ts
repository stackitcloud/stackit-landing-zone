import { isDeepStrictEqual } from "node:util";
import {
  applicationPermissionServiceMentioned,
  applicationServiceAccountKeyPermissions,
  defaultApplicationAccessProfile,
  type JsonValue,
  objectValue,
  serviceAccountKeyManagementMentioned,
} from "@lzc/domain";
import {
  type ConsultationChange,
  ConsultationOperationError,
} from "./proposal-operations.js";

/** Catalogue membership proves that rights exist, not that a service was requested.
 * Apply the same source check to typed unions and fully materialized profile edits. */
export function validateConsultationPermissionSources(
  operations: ConsultationChange[],
  changes: { path: string; value: JsonValue }[],
  current: Record<string, unknown>,
  userSources: string[],
) {
  const statements = userSources.map(
    (source) =>
      source.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? source,
  );
  const existing = objectValue(current.projectTemplates as JsonValue);
  const trusted = new Map<string, Set<string>>();
  const addTrusted = (key: string, field: string, names: string[]) => {
    const path = `${key}.${field}`;
    const values = trusted.get(path) ?? new Set<string>();
    for (const name of names) values.add(name);
    trusted.set(path, values);
  };
  for (const operation of operations) {
    const value = objectValue(operation.value);
    const preset = /^projectTemplates\.([^.]+)\.accessProfile$/.exec(
      operation.path,
    );
    if (
      operation.operation === "preset" &&
      preset &&
      ["application-vm-v1", "application-workloads-v1"].includes(
        String(value.id),
      )
    ) {
      const profile = defaultApplicationAccessProfile(
        "",
        value.id === "application-vm-v1" ? "vm" : "workload",
      );
      addTrusted(preset[1]!, "permissions", profile.permissions);
      addTrusted(
        preset[1]!,
        "automationPermissions",
        profile.automationPermissions,
      );
    }
    const source = objectValue(value.source);
    if (
      operation.operation === "add_permissions" &&
      operation.path === "projectTemplates" &&
      source.kind === "permission_set" &&
      source.id === "service-account-keys" &&
      statements.some(serviceAccountKeyManagementMentioned)
    ) {
      for (const key of Array.isArray(value.templateKeys)
        ? value.templateKeys
        : [])
        for (const principal of Array.isArray(value.principals)
          ? value.principals
          : [])
          if (
            typeof key === "string" &&
            ["requester", "automation"].includes(String(principal))
          )
            addTrusted(
              key,
              principal === "requester"
                ? "permissions"
                : "automationPermissions",
              applicationServiceAccountKeyPermissions,
            );
    }
  }
  const literal = new Set(
    statements.flatMap(
      (source) =>
        source.match(/\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}\b/g) ?? [],
    ),
  );
  const serviceSources = new Map<string, boolean>();
  for (const change of changes.filter(
    (change) => change.path === "projectTemplates",
  )) {
    for (const [key, patch] of Object.entries(objectValue(change.value))) {
      const profile = objectValue(objectValue(patch).accessProfile);
      const prior = objectValue(objectValue(existing[key]).accessProfile);
      if (!existing[key]) {
        const native = defaultApplicationAccessProfile(
          String(profile.initialOwnerEmail ?? ""),
        );
        const observed = Object.values(existing).some((template) =>
          isDeepStrictEqual(
            profile,
            objectValue(objectValue(template).accessProfile),
          ),
        );
        if (isDeepStrictEqual(profile, native) || observed) {
          for (const field of ["permissions", "automationPermissions"])
            addTrusted(
              key,
              field,
              Array.isArray(profile[field])
                ? profile[field].filter(
                    (name): name is string => typeof name === "string",
                  )
                : [],
            );
        }
      }
      for (const field of ["permissions", "automationPermissions"]) {
        const before = new Set(Array.isArray(prior[field]) ? prior[field] : []);
        for (const name of Array.isArray(profile[field])
          ? profile[field]
          : []) {
          if (
            typeof name !== "string" ||
            before.has(name) ||
            literal.has(name) ||
            trusted.get(`${key}.${field}`)?.has(name)
          )
            continue;
          const service = name.split(".")[0]!;
          if (!serviceSources.has(service))
            serviceSources.set(
              service,
              service !== "iam" &&
                statements.some((source) =>
                  applicationPermissionServiceMentioned(service, source),
                ),
            );
          if (!serviceSources.get(service))
            throw new ConsultationOperationError(
              "assistant_permission_service_unconfirmed",
              `projectTemplates.${key}.accessProfile.${field}`,
              `Additional ${service} permissions have no applicable USER or registered-workflow source. Catalogue membership and a workflow's motivation do not request its full administration rights. Preserve the existing profile and use only the requested service groups, literal permissions or registered native preset/workflow bundle. For service-account key management, use the registered service-account-keys workflow instead of reconstructing an IAM list. Ask a focused question if another service is actually needed; do not infer it from purpose or tooling.`,
            );
        }
      }
    }
  }
}
