import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { s3BackendConfiguration, s3RunnerBackendSchema } from "@lzc/contracts";
import {
  recoveryRevocationStep,
  recoverySha256,
} from "@lzc/contracts/recovery";
import {
  prepareNativeStateRecovery,
  type RecoveryNativeCommand,
  recoveryNativeCommand,
} from "./state-recovery-native.js";

/** Only called for a separately approved, task-bound proposal. API fences durably
 * record each intent and independently revalidate CF, State, lock and cloud proof.
 * No fence or native mutation is automatically repeated after an uncertain reply. */
export async function publishNativeStateRecovery(
  input: Parameters<typeof prepareNativeStateRecovery>[0] & {
    candidate: Buffer;
    approvedCandidateSha256: string;
    backend: unknown;
    orphanLockId: string | null;
  },
  fence: (step: "unlock" | "publish" | `revoke:${string}`) => Promise<void>,
  command: RecoveryNativeCommand = recoveryNativeCommand,
) {
  const backend = s3RunnerBackendSchema.parse(input.backend);
  if (
    backend.descriptor.key !==
      `applications/${input.tenantId}/${input.instanceId}/terraform.tfstate` ||
    recoverySha256(input.candidate) !== input.approvedCandidateSha256
  )
    throw new Error("checkpoint-changed");
  if (
    input.orphanLockId !== null &&
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.orphanLockId)
  )
    throw new Error("checkpoint-invalid");
  // Provider reads/Plan are repeated before any unlock to reject changed live
  // attributes that an inventory's identity-only view would not detect.
  const current = await prepareNativeStateRecovery(input, command);
  if (recoverySha256(current.candidate) !== input.approvedCandidateSha256)
    throw new Error("checkpoint-changed");
  const work = await mkdtemp(resolve(tmpdir(), "lzc-state-publish-"));
  let intent = false;
  try {
    await writeFile(
      resolve(work, "backend.tf.json"),
      s3BackendConfiguration(backend.descriptor),
      { mode: 0o600, flag: "wx" },
    );
    await writeFile(resolve(work, "reviewed.tfstate"), input.candidate, {
      mode: 0o600,
      flag: "wx",
    });
    const env = {
      PATH: `${resolve(input.root)}/tools:/usr/bin:/bin`,
      TMPDIR: work,
      TF_INPUT: "0",
      TF_IN_AUTOMATION: "true",
      CHECKPOINT_DISABLE: "1",
      AWS_ACCESS_KEY_ID: backend.credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: backend.credentials.secretAccessKey,
      AWS_REGION: backend.descriptor.region,
      AWS_DEFAULT_REGION: backend.descriptor.region,
    };
    const run = (args: string[]) =>
      command({
        binary: resolve(input.root, "tools/tofu"),
        args,
        cwd: work,
        env,
        timeout: 60_000,
      });
    await run(["init", "-input=false", "-no-color"]);
    // Set before requesting the fence: an uncertain broker reply must never lead
    // to a new native action, even if the caller did not observe the receipt.
    intent = true;
    for (const revocation of current.revocations)
      await fence(recoveryRevocationStep(revocation) as `revoke:${string}`);
    await fence("unlock");
    if (input.orphanLockId)
      await run(["force-unlock", "-force", input.orphanLockId]);
    await fence("publish");
    await run([
      "state",
      "push",
      "-lock-timeout=0s",
      resolve(work, "reviewed.tfstate"),
    ]);
    // Success is determined by the API's independent S3 read, not this return.
    return { publicationRequested: true as const };
  } catch (error) {
    if (intent) throw new Error("commit-outcome-unknown");
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
