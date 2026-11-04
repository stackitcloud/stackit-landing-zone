import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { projectIamMigrationSummarySchema } from "../project-iam.js";
import { readRecoveryState, recoverySha256 } from "./proof.js";

const privileged = new Set(["owner", "project.owner", "project.admin"]);
const binding = z.strictObject({
  role: z.string().min(1).max(128),
  subject: z.string().min(1).max(254),
});
export const projectIamMigrationSchema = z.strictObject({
  version: z.literal(1),
  instanceId: z.uuid(),
  projectId: z.uuid(),
  requester: z.email(),
  automation: z.email().nullable(),
  centralOwner: z.email(),
  mode: z.enum(["granular", "owner"]),
  phase: projectIamMigrationSummarySchema.shape.phase,
  bindings: z
    .record(z.string().min(1).max(400), binding)
    .refine((v) => Object.keys(v).length <= 100),
  imports: z
    .record(z.string().min(1).max(400), z.string().min(1).max(700))
    .refine((v) => Object.keys(v).length <= 100),
  retainedAssignments: z.array(binding).max(100),
  retainedAutomationRole: z.string().max(128).nullable(),
  oldBindings: z.array(binding).max(100),
});
export type ProjectIamMigration = z.infer<typeof projectIamMigrationSchema>;
const key = (b: { role: string; subject: string }) =>
  `${b.role}-${b.subject.toLowerCase()}`;
const identity = (project: string, b: { role: string; subject: string }) =>
  `${project},${b.role},${b.subject}`;
const rootName = "lzc_project_iam";
export const projectIamAddress = (k: string) =>
  `stackit_authorization_project_role_assignment.${rootName}[${JSON.stringify(k)}]`;

/** Direct project membership only. Never request parent/organization bindings. */
export function prepareProjectIamMigration(input: {
  variables: unknown;
  state: Buffer | null;
  members: unknown;
  purpose?: "standard" | "drift" | "destroy";
}): ProjectIamMigration | null {
  const variables = z
    .object({
      application: z.object({
        instance_id: z.uuid(),
        owner_email: z.email(),
        initial_owner_email: z.email().nullable().optional(),
        automation_role: z.string().optional(),
        role_assignments: z.array(binding).default([]),
      }),
    })
    .parse(input.variables);
  const a = variables.application;
  if (!input.state) return null;
  const state = readRecoveryState(input.state, a.instance_id);
  const project = state.instances.filter(
    (i) =>
      i.address === "module.application.stackit_resourcemanager_project.this",
  );
  if (
    !project.length &&
    !state.instances.some((i) => i.resource.name === rootName)
  )
    return null;
  if (project.length !== 1) throw new Error("iam-project-unavailable");
  const projectId = z.uuid().parse(project[0]!.instance.attributes.project_id);
  const members = z
    .strictObject({
      resourceId: z.literal(projectId),
      resourceType: z.literal("project"),
      members: z
        .array(
          z.object({
            role: z.string().min(1).max(128),
            subject: z.string().min(1).max(254),
          }),
        )
        .max(1000),
    })
    .parse(input.members)
    .members.map((b) => ({ ...b, subject: b.subject.toLowerCase() }));
  const ids = new Set<string>();
  for (const b of members) {
    const id = key(b);
    if (ids.has(id)) throw new Error("iam-inventory-incomplete");
    ids.add(id);
  }
  const account = state.instances.find(
    (i) =>
      i.address === "module.application.stackit_service_account.automation",
  );
  const automation = account
    ? z.email().parse(account.instance.attributes.email)
    : null;
  const centralOwner = (a.initial_owner_email ?? a.owner_email).toLowerCase();
  const mode =
    a.initial_owner_email && a.automation_role !== "owner"
      ? "granular"
      : "owner";
  if (mode === "granular" && centralOwner === a.owner_email.toLowerCase())
    throw new Error("iam-owner-conflict");
  const managed = state.instances.filter(
    (i) => i.resource.type === "stackit_authorization_project_role_assignment",
  );
  const owned: Record<string, z.infer<typeof binding>> = {};
  const elsewhere = new Set<string>();
  for (const item of managed) {
    const b = binding.parse({
      role: item.instance.attributes.role,
      subject: item.instance.attributes.subject,
    });
    if (item.instance.attributes.resource_id !== projectId)
      throw new Error("iam-project-mismatch");
    if (item.resource.module === undefined && item.resource.name === rootName) {
      if (
        typeof item.instance.index_key !== "string" ||
        item.instance.index_key !== key(b) ||
        !privileged.has(b.role)
      )
        throw new Error("iam-state-invalid");
      owned[key(b)] = b;
    } else elsewhere.add(key(b));
  }
  const desired = { role: "owner", subject: centralOwner };
  const desiredKey = key(desired);
  if (elsewhere.has(desiredKey)) throw new Error("iam-owner-managed-elsewhere");
  const oldBindings =
    mode === "owner"
      ? []
      : members
          .filter(
            (b) =>
              privileged.has(b.role) &&
              b.subject.toLowerCase() !== centralOwner &&
              (b.subject.toLowerCase() === a.owner_email.toLowerCase() ||
                b.subject.toLowerCase() === automation?.toLowerCase() ||
                Object.hasOwn(owned, key(b))),
          )
          .map((b) => binding.parse(b));
  if (oldBindings.length > 100) throw new Error("iam-inventory-incomplete");
  const maintenance = input.purpose === "drift" || input.purpose === "destroy";
  const prepared =
    ids.has(desiredKey) &&
    Object.hasOwn(owned, desiredKey) &&
    oldBindings.every(
      (b) => Object.hasOwn(owned, key(b)) || elsewhere.has(key(b)),
    );
  const phase = maintenance
    ? "maintenance"
    : oldBindings.length
      ? prepared
        ? "cleanup"
        : "prepare"
      : "complete";
  const bindings: Record<string, z.infer<typeof binding>> = maintenance
    ? { ...owned }
    : { [desiredKey]: desired };
  if (phase === "prepare" || mode === "owner") Object.assign(bindings, owned);
  if (phase === "prepare")
    for (const b of oldBindings)
      if (!elsewhere.has(key(b))) bindings[key(b)] = b;
  const imports = maintenance
    ? {}
    : Object.fromEntries(
        Object.entries(bindings)
          .filter(([k]) => !Object.hasOwn(owned, k) && ids.has(k))
          .map(([k, b]) => [k, identity(projectId, b)]),
      );
  const retainedAssignments =
    phase !== "prepare"
      ? []
      : managed
          .filter(
            (i) =>
              i.resource.module === "module.application" &&
              i.resource.name === "this" &&
              privileged.has(String(i.instance.attributes.role)),
          )
          .map((i) =>
            binding.parse({
              role: i.instance.attributes.role,
              subject: i.instance.attributes.subject,
            }),
          )
          .filter((b) => !a.role_assignments.some((x) => key(x) === key(b)));
  const oldAutomation = managed.find(
    (i) =>
      i.address ===
      "module.application.stackit_authorization_project_role_assignment.sa_owner",
  );
  const retainedAutomationRole =
    phase === "prepare" &&
    oldAutomation &&
    privileged.has(String(oldAutomation.instance.attributes.role))
      ? String(oldAutomation.instance.attributes.role)
      : null;
  if (maintenance && !Object.keys(bindings).length) return null;
  return projectIamMigrationSchema.parse({
    version: 1,
    instanceId: a.instance_id,
    projectId,
    requester: a.owner_email.toLowerCase(),
    automation,
    centralOwner,
    mode,
    phase,
    bindings,
    imports,
    retainedAssignments,
    retainedAutomationRole,
    oldBindings,
  });
}

export function projectIamSummary(input: ProjectIamMigration) {
  const c = projectIamMigrationSchema.parse(input);
  return projectIamMigrationSummarySchema.parse({
    version: 1,
    phase: c.phase,
    imports: Object.keys(c.imports).length,
    pendingRemovals: c.oldBindings.length,
  });
}

/** Static, reviewed Runner extension; historical Accelerator payloads remain unchanged. */
export function projectIamConfiguration(input: ProjectIamMigration) {
  const c = projectIamMigrationSchema.parse(input);
  return {
    configuration: JSON.stringify({
      variable: { lzc_project_iam: { type: "any", default: null } },
      resource: {
        stackit_authorization_project_role_assignment: {
          lzc_project_iam: {
            for_each:
              "${var.lzc_project_iam == null ? {} : var.lzc_project_iam.bindings}",
            resource_id: "${module.application.project_id}",
            role: "${each.value.role}",
            subject: "${each.value.subject}",
            lifecycle: {
              create_before_destroy: true,
              precondition: [
                {
                  condition:
                    "${var.lzc_project_iam.projectId == module.application.project_id}",
                  error_message: "Project IAM migration identity changed.",
                },
              ],
            },
          },
        },
      },
      import: [
        {
          for_each:
            "${var.lzc_project_iam == null ? {} : var.lzc_project_iam.imports}",
          to: "stackit_authorization_project_role_assignment.lzc_project_iam[each.key]",
          id: "${each.value}",
        },
      ],
    }),
    variables: JSON.stringify({ lzc_project_iam: c }),
    override:
      c.retainedAssignments.length || c.retainedAutomationRole
        ? JSON.stringify({
            module: {
              application: {
                ...(c.retainedAssignments.length
                  ? {
                      role_assignments:
                        "${concat(var.application.role_assignments, var.lzc_project_iam.retainedAssignments)}",
                    }
                  : {}),
                ...(c.retainedAutomationRole
                  ? {
                      automation_role:
                        "${var.lzc_project_iam.retainedAutomationRole}",
                    }
                  : {}),
              },
            },
          })
        : null,
  };
}

export function assertProjectIamScope(
  context: ProjectIamMigration,
  variables: unknown,
) {
  const c = projectIamMigrationSchema.parse(context);
  const a = z
    .object({
      application: z.object({
        instance_id: z.uuid(),
        owner_email: z.email(),
        initial_owner_email: z.email().nullable().optional(),
      }),
    })
    .parse(variables).application;
  if (
    c.instanceId !== a.instance_id ||
    c.requester !== a.owner_email.toLowerCase() ||
    c.centralOwner !== (a.initial_owner_email ?? a.owner_email).toLowerCase()
  )
    throw new Error("iam-context-mismatch");
  for (const [k, b] of Object.entries(c.bindings))
    if (k !== key(b) || !privileged.has(b.role))
      throw new Error("iam-context-mismatch");
  for (const [k, id] of Object.entries(c.imports))
    if (!c.bindings[k] || id !== identity(c.projectId, c.bindings[k]!))
      throw new Error("iam-context-mismatch");
}

const prefix = Buffer.from("LZC-APPLICATION-PLAN-IAM/1\n");
const artifactSchema = z.strictObject({
  version: z.literal(1),
  native: z.string().max(24 * 1024 * 1024),
  nativeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  iam: projectIamMigrationSchema,
});
/** The single encrypted artifact hash binds both the native Plan and migration context. */
export function encodeProjectIamPlan(native: Buffer, iam: ProjectIamMigration) {
  if (!native.length || native.length > 16 * 1024 * 1024)
    throw new Error("iam-artifact-invalid");
  const data = artifactSchema.parse({
    version: 1,
    native: native.toString("base64"),
    nativeSha256: recoverySha256(native),
    iam,
  });
  const result = Buffer.concat([prefix, gzipSync(JSON.stringify(data))]);
  if (result.length > 16 * 1024 * 1024) throw new Error("iam-artifact-invalid");
  return result;
}
export function decodeProjectIamPlan(bytes: Buffer): {
  native: Buffer;
  iam: ProjectIamMigration | null;
} {
  if (!bytes.subarray(0, prefix.length).equals(prefix)) {
    if (
      bytes.subarray(0, 25).toString().startsWith("LZC-APPLICATION-PLAN-IAM/")
    )
      throw new Error("iam-artifact-invalid");
    return { native: bytes, iam: null };
  }
  const data = artifactSchema.parse(
    JSON.parse(
      gunzipSync(bytes.subarray(prefix.length), {
        maxOutputLength: 24 * 1024 * 1024,
      }).toString("utf8"),
    ),
  );
  const native = Buffer.from(data.native, "base64");
  if (
    !native.length ||
    native.length > 16 * 1024 * 1024 ||
    native.toString("base64") !== data.native ||
    recoverySha256(native) !== data.nativeSha256
  )
    throw new Error("iam-artifact-invalid");
  return { native, iam: data.iam };
}

export function projectIamEffectiveVariables(
  variables: unknown,
  context: ProjectIamMigration,
) {
  assertProjectIamScope(context, variables);
  const v = z
    .object({ application: z.record(z.string(), z.unknown()) })
    .passthrough()
    .parse(variables);
  const a = v.application;
  return {
    ...v,
    lzc_project_iam: context,
    application: {
      ...a,
      ...(context.retainedAssignments.length
        ? {
            role_assignments: [
              ...z.array(binding).parse(a.role_assignments ?? []),
              ...context.retainedAssignments,
            ],
          }
        : {}),
      ...(context.retainedAutomationRole
        ? { automation_role: context.retainedAutomationRole }
        : {}),
    },
  };
}
