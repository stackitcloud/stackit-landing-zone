import { z } from "zod";
import permissions from "./application-workload-permissions.js";
import type { Values } from "./configuration.js";
import projectCatalogue from "./project-permissions.generated.js";

export const applicationWorkloadPermissions = permissions.permissions;
export const applicationProjectPermissions = projectCatalogue.permissions;
export const applicationProjectPermissionNames =
  applicationProjectPermissions.map((p) => p.name);
export const applicationProjectPermissionCheckedAt = projectCatalogue.checkedAt;
export const applicationPermissionServices = [
  ...new Set(
    applicationProjectPermissionNames.map((p) => p.split(".")[0] ?? p),
  ),
].sort();
export const applicationPermissionServiceAliases: Record<string, string[]> = {
  ske: ["kubernetes", "ske", "k8s"],
  iam: ["iam", "zugriffsverwaltung", "access management"],
  "postgres-flex": ["postgres", "postgresql"],
  mongodbflex: ["mongodb"],
  redis: ["redis"],
  "object-storage": ["object storage", "object-storage", "s3"],
  argus: ["observability", "argus", "grafana"],
  "secrets-manager": ["secrets manager", "secrets-manager"],
  "resource-manager": [
    "resource manager",
    "resource-manager",
    "projektverwaltung",
  ],
  alb: ["load balancer", "alb"],
};
export function applicationPermissionServiceMentioned(
  service: string,
  quote: string,
) {
  const text = quote.toLowerCase();
  return [
    service,
    service.replaceAll("-", " "),
    ...(applicationPermissionServiceAliases[service] ?? []),
  ].some((alias) =>
    new RegExp(`(?:^|[^a-z0-9])${alias}(?:$|[^a-z0-9])`).test(text),
  );
}
/** Syntax is forward-compatible; publication and model proposals also check the trusted catalogue. */
export const applicationPermissionName = z
  .string()
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/);
export function unknownApplicationPermissions(
  profile: ApplicationAccessProfile,
  live: readonly string[] = [],
) {
  if (profile.mode === "owner") return [];
  const known = new Set([...applicationProjectPermissionNames, ...live]);
  return [
    ...new Set([...profile.permissions, ...profile.automationPermissions]),
  ].filter((p) => !known.has(p));
}
export const applicationWorkloadRole = "application-workload";
const permissionList = z
  .array(applicationPermissionName)
  .min(1)
  .max(2000)
  .refine(
    (items) => new Set(items).size === items.length,
    "Select distinct STACKIT project permission identifiers.",
  );
export const applicationAccessProfileSchema = z.discriminatedUnion("mode", [
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("owner") }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("granular"),
    initialOwnerEmail: z.string().max(254),
    permissions: permissionList,
    automationPermissions: permissionList,
  }),
]);
export type ApplicationAccessProfile = z.infer<
  typeof applicationAccessProfileSchema
>;

export function validateApplicationAccessProfile(
  input: unknown,
  settings: Values,
  contextRoles: unknown,
  publication = false,
) {
  if (input === undefined) return;
  const profile = applicationAccessProfileSchema.parse(input);
  if (
    (Array.isArray(settings.custom_roles) && settings.custom_roles.length) ||
    (Array.isArray(settings.role_assignments) &&
      settings.role_assignments.length) ||
    Object.hasOwn(settings, "automation_role") ||
    Object.hasOwn(settings, "initial_owner_email") ||
    (contextRoles !== undefined &&
      !z.object({ source: z.literal("fixed") }).safeParse(contextRoles).success)
  )
    throw new Error(
      "Ein Rechteprofil kann nicht mit zusätzlichen Rollen oder einer eigenen Rollen-Kontextbindung kombiniert werden.",
    );
  if (
    publication &&
    profile.mode === "granular" &&
    !z.email().safeParse(profile.initialOwnerEmail).success
  )
    throw new Error(
      "Für granulare Rechte muss der Platform Owner einen separaten initialen Projekt-Owner festlegen.",
    );
}

/** Immutable template policy only; never accept these values from order parameters. */
export function resolveApplicationAccessProfile<T extends Values>(
  input: unknown,
  settings: T,
  verifiedEmail?: string,
): T & {
  initial_owner_email?: string;
  automation_role?: string;
  custom_roles?: { name: string; description: string; permissions: string[] }[];
  role_assignments?: { role: string; subject: string }[];
} {
  if (input === undefined) return settings;
  const profile = applicationAccessProfileSchema.parse(input);
  if (profile.mode === "owner")
    return { ...settings, automation_role: "owner" };
  if (!z.email().safeParse(profile.initialOwnerEmail).success)
    throw new Error("Der initiale Projekt-Owner fehlt.");
  if (verifiedEmail?.toLowerCase() === profile.initialOwnerEmail.toLowerCase())
    throw new Error(
      "Ein granulares Profil benötigt einen anderen initialen Projekt-Owner als die bestellende Person.",
    );
  const automationRole = "application-automation";
  return {
    ...settings,
    initial_owner_email: profile.initialOwnerEmail,
    automation_role: automationRole,
    custom_roles: [
      {
        name: applicationWorkloadRole,
        description: "Versioned Application team workload permissions",
        permissions: profile.permissions,
      },
      {
        name: automationRole,
        description: "Versioned Application workload automation permissions",
        permissions: profile.automationPermissions,
      },
    ],
    role_assignments: verifiedEmail
      ? [{ role: applicationWorkloadRole, subject: verifiedEmail }]
      : [],
  };
}

export function defaultApplicationAccessProfile(
  initialOwnerEmail = "",
  preset: "workload" | "vm" = "workload",
): Extract<ApplicationAccessProfile, { mode: "granular" }> {
  return {
    schemaVersion: 1,
    mode: "granular",
    initialOwnerEmail,
    permissions: [
      ...(preset === "vm"
        ? permissions.vmPermissions
        : applicationWorkloadPermissions),
    ],
    automationPermissions: [
      ...(preset === "vm"
        ? permissions.vmPermissions
        : applicationWorkloadPermissions),
    ],
  };
}
