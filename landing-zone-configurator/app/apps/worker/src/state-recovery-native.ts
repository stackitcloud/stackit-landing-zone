import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { applicationExecutionProfile } from "@lzc/contracts";
import {
  deriveApplicationRecoveryImports,
  deriveApplicationRecoveryRevocations,
  readApplicationExecutionManifest,
  recoverySha256,
  retainRecoveryOutputs,
  verifyImportedRecoveryState,
  verifyRecoveryPreview,
} from "@lzc/contracts/recovery";
import { z } from "zod";
import {
  applicationAcceleratorCommit,
  applicationProviderLockHash,
} from "./runner.js";

export type RecoveryNativeCommand = (input: {
  binary: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeout: number;
}) => Promise<string>;
export const recoveryNativeCommand: RecoveryNativeCommand = async (input) => {
  try {
    const result = await promisify(execFile)(input.binary, input.args, {
      cwd: input.cwd,
      env: input.env,
      timeout: input.timeout,
      maxBuffer: 24 * 1024 * 1024,
      encoding: "utf8",
      killSignal: "SIGKILL",
    });
    return result.stdout;
  } catch {
    // Native stderr can contain State, credentials, email addresses and IDs.
    throw new Error("native-recovery-failed");
  }
};
async function bounded(path: string, limit: number) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw new Error("checkpoint-invalid");
  const value = await readFile(path);
  if (value.length > limit) throw new Error("checkpoint-invalid");
  return value;
}

/** Native imports and diagnostic Plan against a local copy only. No remote backend or Apply. */
export async function prepareNativeStateRecovery(
  input: {
    root: string;
    tenantId: string;
    instanceId: string;
    sourceRevision: string;
    providerLockSha256: string;
    variables: unknown;
    key: unknown;
    original: Buffer;
    inventory: unknown;
  },
  command: RecoveryNativeCommand = recoveryNativeCommand,
) {
  z.uuid().parse(input.tenantId);
  z.uuid().parse(input.instanceId);
  const execution = await readApplicationExecutionManifest(input.root);
  const profile = execution
    ? applicationExecutionProfile(execution, input.sourceRevision)
    : undefined;
  if (profile && !profile.maintenanceEnabled)
    throw new Error("Application source maintenance disabled");
  if (
    input.sourceRevision !==
      (profile?.revision ?? applicationAcceleratorCommit) ||
    input.providerLockSha256 !== applicationProviderLockHash
  )
    throw new Error("source-changed");
  const imports = deriveApplicationRecoveryImports({
    sourceRevision: input.sourceRevision,
    state: input.original,
    variables: input.variables,
    inventory: input.inventory,
    tenantId: input.tenantId,
    instanceId: input.instanceId,
  });
  const revocations = deriveApplicationRecoveryRevocations({
    sourceRevision: input.sourceRevision,
    state: input.original,
    variables: input.variables,
    inventory: input.inventory,
    tenantId: input.tenantId,
    instanceId: input.instanceId,
  });
  const variables = JSON.stringify(input.variables);
  const credential = JSON.stringify(input.key);
  if (
    Buffer.byteLength(variables) > 1024 * 1024 ||
    Buffer.byteLength(credential) > 32768
  )
    throw new Error("checkpoint-invalid");
  const root = resolve(input.root);
  const source = resolve(root, profile?.sourcePath ?? "application-src");
  const lock = await bounded(
    resolve(source, "application/.terraform.lock.hcl"),
    1024 * 1024,
  );
  if (recoverySha256(lock) !== input.providerLockSha256)
    throw new Error("source-changed");
  if (
    recoverySha256(
      await bounded(resolve(source, "application/backend.tf"), 4096),
    ) !== "180a355bc7d4e61186860d7c78cd8e044585bffbbbff4cdc86b63b49d55d507c"
  )
    throw new Error("source-changed");
  const files = await readdir(source, { recursive: true });
  if (files.length > 1000) throw new Error("source-changed");
  for (const file of files) {
    const info = await lstat(resolve(source, file));
    if (
      info.isSymbolicLink() ||
      /(^|\/)(\.terraform|.*\.tfstate(?:\..*)?|.*\.tfvars(?:\.json)?|credential\.json|.*\.log)(\/|$)/.test(
        file,
      )
    )
      throw new Error("source-changed");
  }
  const folder = await mkdtemp(resolve(tmpdir(), "lzc-state-recovery-"));
  const work = resolve(folder, "application");
  const deadline = Date.now() + 5 * 60_000;
  try {
    await cp(source, folder, { recursive: true });
    // Never initialize S3 during proposal preparation. Neither AWS credentials
    // nor a remote backend are passed to this process environment.
    await rm(resolve(work, "backend.tf"));
    await writeFile(resolve(work, "terraform.tfstate"), input.original, {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(resolve(work, "original.auto.tfvars.json"), variables, {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(resolve(work, "credential.json"), credential, {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(
      resolve(work, "runner.tfrc"),
      await bounded(resolve(root, "runner.tfrc"), 65536),
      { mode: 0o600, flag: "wx" },
    );
    const env = {
      PATH: `${root}/tools:/usr/bin:/bin`,
      TMPDIR: folder,
      TF_INPUT: "0",
      TF_IN_AUTOMATION: "true",
      CHECKPOINT_DISABLE: "1",
      TF_CLI_CONFIG_FILE: resolve(work, "runner.tfrc"),
      STACKIT_SERVICE_ACCOUNT_KEY_PATH: resolve(work, "credential.json"),
    };
    const run = async (args: string[]) => {
      if (Date.now() >= deadline) throw new Error("native-recovery-failed");
      return command({
        binary: resolve(root, "tools/tofu"),
        args,
        cwd: work,
        env,
        timeout: Math.max(1, Math.min(120_000, deadline - Date.now())),
      });
    };
    const engine = z
      .object({ terraform_version: z.literal("1.12.6") })
      .parse(JSON.parse(await run(["version", "-json"])));
    if (!engine) throw new Error("source-changed");
    await run(["init", "-input=false", "-lockfile=readonly", "-no-color"]);
    const local = resolve(work, ".terraform/terraform.tfstate");
    const backend = await readFile(local, "utf8").then(
      (v) => JSON.parse(v),
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return {};
        throw e;
      },
    );
    if (backend.backend && backend.backend.type !== "local")
      throw new Error("source-changed");
    for (const r of revocations.filter((r) => r.discardIncompleteState))
      await run(["state", "rm", r.address]);
    for (const item of imports)
      await run([
        "import",
        "-input=false",
        "-no-color",
        item.address,
        item.resourceId,
      ]);
    const candidate = retainRecoveryOutputs(
      input.original,
      await bounded(resolve(work, "terraform.tfstate"), 16 * 1024 * 1024),
      input.instanceId,
    );
    const proof = verifyImportedRecoveryState({
      original: input.original,
      candidate,
      instanceId: input.instanceId,
      imports,
      revocations,
    });
    await writeFile(resolve(work, "terraform.tfstate"), candidate, {
      mode: 0o600,
    });
    await run([
      "plan",
      "-input=false",
      "-no-color",
      "-out=recovery-preview.bin",
    ]);
    const preview = await run(["show", "-json", "recovery-preview.bin"]);
    if (Buffer.byteLength(preview) > 16 * 1024 * 1024)
      throw new Error("unexpected-plan-change");
    const summary = verifyRecoveryPreview(
      JSON.parse(preview),
      candidate,
      input.instanceId,
    );
    return {
      candidate,
      revocations,
      preview: Buffer.from(preview),
      imports,
      proof,
      summary,
    };
  } finally {
    // Preparation never relies on a stopped container to preserve key material.
    await rm(folder, { recursive: true, force: true });
  }
}
