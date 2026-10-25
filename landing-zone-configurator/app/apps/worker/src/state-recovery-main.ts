import { applicationStateRecoveryBlockerSchema } from "@lzc/contracts";
import {
  decodeRecoveryArtifact,
  encodeRecoveryArtifact,
  recoveryArtifactSchema,
} from "@lzc/contracts/recovery";
import { z } from "zod";
import { brokerOrigin } from "./runner.js";
import { prepareNativeStateRecovery } from "./state-recovery-native.js";
import { publishNativeStateRecovery } from "./state-recovery-publish.js";

const configuration = z
  .object({
    LZC_STATE_RECOVERY_TASK: z.uuid(),
    LZC_RUN_TICKET: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    LZC_BROKER_ORIGIN: z.literal(brokerOrigin),
    LZC_RUNNER_BROKER: z.literal("application"),
  })
  .parse(process.env);
const inputSchema = z.object({
  id: z.literal(configuration.LZC_STATE_RECOVERY_TASK),
  mode: z.enum(["prepare", "commit"]),
  tenantId: z.uuid(),
  instanceId: z.uuid(),
  sourceRevision: z.string(),
  providerLockSha256: z.string(),
  original: recoveryArtifactSchema,
  variables: z.unknown(),
  inventory: z.unknown(),
  key: z.unknown(),
  candidate: recoveryArtifactSchema.optional(),
  approvedCandidateSha256: z.string().optional(),
  backend: z.unknown().optional(),
  orphanLockId: z.string().nullable().optional(),
});
async function report(path: "input" | "fence" | "result", body: unknown) {
  const response = await fetch(
    `${brokerOrigin}/api/application-state-recovery/${path}`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${configuration.LZC_RUN_TICKET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok || !response.body) throw new Error("native-recovery-failed");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 12 * 1024 * 1024) throw new Error("checkpoint-invalid");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
process.umask(0o077);
let outcome = 1;
try {
  const body = inputSchema.parse(await report("input", {}));
  const input = {
    root: process.cwd(),
    tenantId: body.tenantId,
    instanceId: body.instanceId,
    sourceRevision: body.sourceRevision,
    providerLockSha256: body.providerLockSha256,
    original: decodeRecoveryArtifact(body.original),
    variables: body.variables,
    key: body.key,
    inventory: body.inventory,
  };
  if (body.mode === "prepare") {
    const result = await prepareNativeStateRecovery(input);
    await report("result", {
      status: "prepared",
      candidate: encodeRecoveryArtifact(result.candidate),
      preview: encodeRecoveryArtifact(result.preview),
    });
  } else {
    if (
      !body.candidate ||
      !body.approvedCandidateSha256 ||
      body.orphanLockId === undefined
    )
      throw new Error("checkpoint-invalid");
    await publishNativeStateRecovery(
      {
        ...input,
        candidate: decodeRecoveryArtifact(body.candidate),
        approvedCandidateSha256: body.approvedCandidateSha256,
        backend: body.backend,
        orphanLockId: body.orphanLockId,
      },
      async (step) => {
        z.strictObject({ allowed: z.literal(true) }).parse(
          await report("fence", { step }),
        );
      },
    );
    await report("result", { status: "publication-requested" });
  }
  outcome = 0;
} catch (error) {
  const known = applicationStateRecoveryBlockerSchema.safeParse(
    error instanceof Error ? error.message : undefined,
  );
  try {
    await report("result", {
      status: "failed",
      blocker: known.success ? known.data : "native-recovery-failed",
    });
  } catch {
    /* The durable task/intent remains inspectable; never replay input or writes. */
  }
  console.error(JSON.stringify({ event: "application-state-recovery-failed" }));
}
process.exitCode = outcome;
