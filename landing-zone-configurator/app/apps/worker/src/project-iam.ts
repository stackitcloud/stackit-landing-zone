import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  assertProjectIamScope,
  type ProjectIamMigration,
  parseServiceAccountKey,
  prepareProjectIamMigration,
  projectIamConfiguration,
  readRecoveryState,
  StackitRecoveryCloud,
} from "@lzc/contracts/recovery";
import { z } from "zod";

export async function pullIamState(
  root: string,
  work: string,
  env: NodeJS.ProcessEnv,
  deadline: number,
) {
  try {
    const result = await promisify(execFile)(
      resolve(root, "tools/tofu"),
      ["state", "pull"],
      {
        cwd: work,
        env,
        timeout: Math.max(1, Math.min(30_000, deadline - Date.now())),
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return result.stdout.trim() ? Buffer.from(result.stdout) : null;
  } catch (error) {
    const e = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
    if (
      e.code === 1 &&
      typeof e.stderr === "string" &&
      /^No state file was found!\s*$/.test(e.stderr) &&
      !e.stdout
    )
      return null;
    throw new Error("iam-state-unavailable");
  }
}

const scope = z.object({
  application: z.object({
    instance_id: z.uuid(),
    template_id: z.string().min(1),
    target_key: z.string().min(1),
  }),
  platform_contract: z.object({
    targets: z.record(z.string(), z.object({ folder_id: z.string().min(1) })),
  }),
});
export async function readDirectIam(
  variables: unknown,
  state: Buffer,
  key: unknown,
  cloud = new StackitRecoveryCloud(),
) {
  const v = scope.parse(variables);
  const project = readRecoveryState(
    state,
    v.application.instance_id,
  ).instances.find(
    (i) =>
      i.address === "module.application.stackit_resourcemanager_project.this",
  );
  if (!project) throw new Error("iam-project-unavailable");
  const projectId = z.uuid().parse(project.instance.attributes.project_id);
  const target = v.platform_contract.targets[v.application.target_key];
  if (!target) throw new Error("iam-target-unavailable");
  return cloud.projectIam(
    {
      projectId,
      instanceId: v.application.instance_id,
      templateId: v.application.template_id,
      folderId: target.folder_id,
    },
    parseServiceAccountKey(key),
  );
}
export async function writeIamConfiguration(
  work: string,
  variables: unknown,
  context: ProjectIamMigration,
) {
  assertProjectIamScope(context, variables);
  const config = projectIamConfiguration(context);
  await writeFile(
    resolve(work, "lzc_project_iam.tf.json"),
    config.configuration,
    { mode: 0o600, flag: "wx" },
  );
  await writeFile(
    resolve(work, "lzc_project_iam.auto.tfvars.json"),
    config.variables,
    { mode: 0o600, flag: "wx" },
  );
  if (config.override)
    await writeFile(
      resolve(work, "lzc_project_iam_override.tf.json"),
      config.override,
      { mode: 0o600, flag: "wx" },
    );
}
export function verifyIamCompletion(
  context: ProjectIamMigration,
  members: Awaited<ReturnType<typeof readDirectIam>>,
) {
  if (members.resourceId !== context.projectId)
    throw new Error("iam-project-mismatch");
  const has = (role: string, subject: string) =>
    members.members.some(
      (b) =>
        b.role === role && b.subject.toLowerCase() === subject.toLowerCase(),
    );
  if (!has("owner", context.centralOwner))
    throw new Error("iam-central-owner-missing");
  if (
    context.mode === "granular" &&
    ["cleanup", "complete"].includes(context.phase) &&
    (context.oldBindings.some((b) => has(b.role, b.subject)) ||
      members.members.some(
        (b) =>
          ["owner", "project.owner", "project.admin"].includes(b.role) &&
          b.subject.toLowerCase() !== context.centralOwner &&
          [context.requester, context.automation?.toLowerCase()].includes(
            b.subject.toLowerCase(),
          ),
      ))
  )
    throw new Error("iam-direct-owner-remains");
}
export { prepareProjectIamMigration };
