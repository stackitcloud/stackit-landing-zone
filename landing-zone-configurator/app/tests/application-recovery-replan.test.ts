import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import {
  approveRecoveryReplan,
  checkRecoveryReplan,
} from "../apps/api/src/applications/recovery-replan.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CredentialError } from "../apps/api/src/credentials/profiles.js";
import { stateDocument } from "../apps/api/src/deployments/backends.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { sha256 } from "../apps/api/src/plans/execution.js";

const secret = "private-state-and-credential-canary";
afterEach(() => vi.useRealTimers());
function fixture() {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "synthetic",
    login: "synthetic",
    csrfToken: "synthetic",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const instanceId = randomUUID();
  const bound = {
    mode: "operator-attested" as "operator-attested" | "reported-failure",
    jobId: randomUUID(),
    instanceId,
    runnerAppId: randomUUID(),
    bindingSha256: "a".repeat(64),
    backendId: randomUUID(),
    backendSha256: "b".repeat(64),
    stateKey: `applications/${session.tenantId}/${instanceId}/terraform.tfstate`,
    backendDescriptor: {
      bucket: "synthetic-bucket",
      endpoint: "https://object.storage.eu01.onstackit.cloud" as const,
      region: "eu01" as const,
      key: `applications/${session.tenantId}/${instanceId}/terraform.tfstate`,
      useLockfile: true as const,
    },
  };
  const contractInstance = {
    attributes: { input: instanceId as string, private: secret },
  };
  const projectInstance = { attributes: { password: secret } };
  const contract = {
    mode: "managed",
    type: "terraform_data",
    name: "contract",
    instances: [contractInstance],
  };
  const project = {
    module: "module.application",
    mode: "managed",
    type: "stackit_resourcemanager_project",
    name: "this",
    instances: [projectInstance],
  };
  const raw = {
    version: 4,
    lineage: randomUUID(),
    serial: 3,
    outputs: { private: { value: secret, sensitive: true } },
    resources: [contract, project],
  };
  const snapshot = () => {
    const bytes = Buffer.from(JSON.stringify(raw));
    return {
      bytes,
      identity: "synthetic-version",
      document: stateDocument(bytes),
    };
  };
  const current = vi.fn(
    async (_backend: unknown, _verifyUnlockedAfterRead?: boolean) => snapshot(),
  );
  const runner = vi.fn(async () => ({
    kind: "s3" as const,
    descriptor: {
      ...bound.backendDescriptor,
      key: "platform/terraform.tfstate",
    },
    credentials: { accessKeyId: secret, secretAccessKey: secret },
  }));
  const query = vi.fn(
    async (
      sql: string,
      args: unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }> => {
      if (sql.includes("application_recovery_replan_context"))
        return { rows: [{ context: bound }] };
      if (sql.includes("record_application_recovery_replan"))
        return {
          rows: [
            {
              job_id: bound.jobId,
              reviewed_by: session.userId,
              reviewed_at: new Date(),
              state_sha256: args[4],
              state_serial: String(args[5]),
            },
          ],
        };
      throw new Error("Unexpected SQL operation");
    },
  );
  const client = { query } as unknown as pg.PoolClient;
  const deps = {
    backends: { runner, current },
    crypto: new ArtifactCrypto(randomBytes(32).toString("base64")),
  };
  const check = () => checkRecoveryReplan(client, session, bound.jobId, deps);
  const request = (reviewToken: string) => ({
    reviewToken,
    confirmRunnerStopped: true,
    confirmCloudStateCompared: true,
    confirmFreshPlan: true,
  });
  const approve = (input: unknown) =>
    approveRecoveryReplan(client, session, bound.jobId, input, deps);
  return {
    session,
    bound,
    contract,
    project,
    contractInstance,
    projectInstance,
    raw,
    snapshot,
    current,
    runner,
    query,
    client,
    deps,
    check,
    request,
    approve,
  };
}
it("observes only the exact Application key and returns counts without raw State or credentials", async () => {
  const f = fixture();
  const result = await f.check();
  expect(f.current).toHaveBeenCalledTimes(2);
  expect(f.runner).toHaveBeenCalledExactlyOnceWith(
    f.client,
    f.session,
    f.bound.backendId,
  );
  for (const [backend, verifyUnlockedAfterRead] of f.current.mock.calls) {
    expect(backend).toMatchObject({
      descriptor: { key: f.bound.stateKey, useLockfile: true },
    });
    expect(verifyUnlockedAfterRead).toBe(true);
  }
  expect(result).toMatchObject({
    jobId: f.bound.jobId,
    instanceId: f.bound.instanceId,
    stateSerial: 3,
    stateSha256: sha256(f.snapshot().bytes),
    stateLock: "free",
    runnerStop: "operator-attestation-required",
    cloudState: "operator-attestation-required",
    startsExecution: false,
    resources: [
      { mode: "managed", type: "stackit_resourcemanager_project", count: 1 },
      { mode: "managed", type: "terraform_data", count: 1 },
    ],
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(f.bound.stateKey);
  expect(f.query).toHaveBeenCalledTimes(1);
});
it("requires a fresh observation again before an immutable historical clearance", async () => {
  const f = fixture();
  const checked = await f.check();
  const receipt = await f.approve(f.request(checked.reviewToken));
  expect(receipt).toMatchObject({
    jobId: f.bound.jobId,
    stateSerial: 3,
    requiresFreshPlan: true,
    startsExecution: false,
    runnerStop: "operator-attested",
    cloudState: "operator-attested",
  });
  expect(JSON.stringify(receipt)).not.toContain(secret);
  expect(f.current).toHaveBeenCalledTimes(4);
  const [sql, args] = f.query.mock.calls.at(-1) ?? ["", []];
  expect(sql).toContain("record_application_recovery_replan");
  expect(args).toEqual([
    f.session.id,
    f.bound.jobId,
    f.bound.bindingSha256,
    f.bound.backendSha256,
    checked.stateSha256,
    3,
    "synthetic-version",
    true,
  ]);
});
it.each(["instance", "key", "job", "lockfile", "backend"])(
  "rejects an incorrect %s binding before reading customer State",
  async (kind) => {
    const f = fixture();
    if (kind === "instance") f.bound.instanceId = randomUUID();
    if (kind === "key")
      f.bound.backendDescriptor.key = "platform/terraform.tfstate";
    if (kind === "job")
      f.query.mockResolvedValueOnce({
        rows: [{ context: { ...f.bound, jobId: randomUUID() } }],
      });
    if (kind === "lockfile")
      Object.assign(f.bound.backendDescriptor, { useLockfile: false });
    if (kind === "backend")
      f.runner.mockResolvedValueOnce({
        kind: "s3",
        descriptor: {
          ...f.bound.backendDescriptor,
          bucket: "different-bucket",
        },
        credentials: { accessKeyId: secret, secretAccessKey: secret },
      });
    await expect(f.check()).rejects.toBeDefined();
    expect(f.current).not.toHaveBeenCalled();
  },
);
it.each(["contract", "duplicate", "deposed", "mode", "resource-type"])(
  "rejects invalid State %s without recording a clearance",
  async (kind) => {
    const f = fixture();
    if (kind === "contract") f.contractInstance.attributes.input = randomUUID();
    if (kind === "duplicate") f.raw.resources.push(structuredClone(f.contract));
    if (kind === "deposed")
      Object.assign(f.projectInstance, {
        deposed: "synthetic",
      });
    if (kind === "mode") f.project.mode = "unknown";
    if (kind === "resource-type")
      f.project.type = "private-state-and-credential-canary!";
    await expect(f.check()).rejects.toMatchObject({
      status: 409,
      code: "application_recovery_replan_state_invalid",
    });
    expect(f.query).toHaveBeenCalledTimes(1);
  },
);
it("accepts the typed OpenTofu terraform_data input representation", async () => {
  const f = fixture();
  Object.assign(f.contractInstance.attributes, {
    input: { value: f.bound.instanceId, type: "string" },
  });
  expect((await f.check()).stateSerial).toBe(3);
});
it.each([
  "first-lock",
  "second-lock",
  "missing",
  "changed-version",
  "changed-bytes",
])("fails closed for %s during snapshot observation", async (kind) => {
  const f = fixture();
  if (kind === "first-lock")
    f.current.mockRejectedValueOnce(new CredentialError(423, "state_locked"));
  if (kind === "second-lock")
    f.current
      .mockResolvedValueOnce(f.snapshot())
      .mockRejectedValueOnce(new CredentialError(423, "state_locked"));
  if (kind === "missing") f.current.mockRejectedValueOnce(new Error(secret));
  if (kind === "changed-version")
    f.current
      .mockResolvedValueOnce(f.snapshot())
      .mockResolvedValueOnce({ ...f.snapshot(), identity: "changed" });
  if (kind === "changed-bytes")
    f.current
      .mockResolvedValueOnce(f.snapshot())
      .mockResolvedValueOnce({ ...f.snapshot(), bytes: Buffer.from(secret) });
  await expect(f.check()).rejects.toMatchObject({
    status: kind.includes("lock") ? 423 : 409,
    code: kind.includes("lock")
      ? "application_recovery_replan_state_locked"
      : kind === "missing"
        ? "application_recovery_replan_state_unavailable"
        : "application_recovery_replan_changed",
  });
  expect(f.query).toHaveBeenCalledTimes(1);
});
it.each(["session", "tenant", "job", "tamper", "expired"])(
  "rejects a %s review token before further reads or writes",
  async (kind) => {
    const f = fixture();
    const checked = await f.check();
    let token = checked.reviewToken;
    if (kind === "session") f.session.id = randomUUID();
    if (kind === "tenant") f.session.tenantId = randomUUID();
    if (kind === "job") f.bound.jobId = randomUUID();
    if (kind === "tamper") {
      const bytes = Buffer.from(token, "base64");
      bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
      token = bytes.toString("base64");
    }
    if (kind === "expired") {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.parse(checked.expiresAt) + 1));
    }
    f.query.mockClear();
    f.current.mockClear();
    await expect(f.approve(f.request(token))).rejects.toMatchObject({
      status: 409,
      code: "application_recovery_replan_changed",
    });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.current).not.toHaveBeenCalled();
  },
);
it.each(["binding", "backend", "runner", "state"])(
  "rejects changed %s between check and approval without a receipt",
  async (kind) => {
    const f = fixture();
    const checked = await f.check();
    if (kind === "binding") f.bound.bindingSha256 = "c".repeat(64);
    if (kind === "backend") f.bound.backendSha256 = "c".repeat(64);
    if (kind === "runner") f.bound.runnerAppId = randomUUID();
    if (kind === "state") f.raw.serial = 4;
    await expect(
      f.approve(f.request(checked.reviewToken)),
    ).rejects.toMatchObject({
      status: 409,
      code: "application_recovery_replan_changed",
    });
    expect(
      f.query.mock.calls.every(
        ([sql]) => !sql.includes("record_application_recovery_replan"),
      ),
    ).toBe(true);
  },
);
it.each([
  "confirmRunnerStopped",
  "confirmCloudStateCompared",
  "confirmFreshPlan",
])("requires explicit %s and rejects arbitrary proof fields", async (flag) => {
  const f = fixture();
  const checked = await f.check();
  f.query.mockClear();
  f.current.mockClear();
  await expect(
    f.approve({ ...f.request(checked.reviewToken), [flag]: false }),
  ).rejects.toBeDefined();
  await expect(
    f.approve({
      ...f.request(checked.reviewToken),
      stateSha256: "f".repeat(64),
    }),
  ).rejects.toBeDefined();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.current).not.toHaveBeenCalled();
});
it("fails closed when checkpoint observation is unavailable", async () => {
  const f = fixture();
  await expect(
    checkRecoveryReplan(f.client, f.session, f.bound.jobId, {
      ...f.deps,
      backends: { runner: f.runner },
    }),
  ).rejects.toMatchObject({
    status: 503,
    code: "application_recovery_replan_unavailable",
  });
  expect(f.runner).not.toHaveBeenCalled();
});

it("supports the original owner's reported failure without external operator attestations", async () => {
  const f = fixture();
  f.bound.mode = "reported-failure";
  const checked = await f.check();
  expect(checked).toMatchObject({
    mode: "reported-failure",
    runnerStop: "reported-command-completed",
    cloudState: "requires-fresh-plan-review",
  });
  const receipt = await f.approve({
    reviewToken: checked.reviewToken,
    confirmFreshPlan: true,
  });
  expect(receipt).toMatchObject({
    mode: "reported-failure",
    runnerStop: "reported-command-completed",
    cloudState: "requires-fresh-plan-review",
    startsExecution: false,
    requiresFreshPlan: true,
  });
  expect(f.query.mock.calls.at(-1)?.[1].at(-1)).toBe(false);
});
it.each(["confirmRunnerStopped", "confirmCloudStateCompared"])(
  "requires %s in operator mode even when the optional flag is omitted",
  async (flag) => {
    const f = fixture();
    const checked = await f.check();
    const input: Record<string, unknown> = f.request(checked.reviewToken);
    delete input[flag];
    await expect(f.approve(input)).rejects.toMatchObject({
      code: "application_recovery_replan_changed",
    });
    expect(
      f.query.mock.calls.every(
        ([sql]) => !sql.includes("record_application_recovery_replan"),
      ),
    ).toBe(true);
  },
);
it("decrypts only the SQL-authorized backend ciphertext and keeps it outside public results and proof plaintext", async () => {
  const f = fixture();
  f.bound.mode = "reported-failure";
  const ciphertext = f.deps.crypto
    .encrypt(
      Buffer.from(
        JSON.stringify({ accessKeyId: secret, secretAccessKey: secret }),
      ),
      f.session.tenantId,
      f.bound.backendId,
      `backend:${f.bound.backendId}`,
    )
    .toString("hex");
  f.query.mockResolvedValueOnce({
    rows: [
      {
        context: {
          ...f.bound,
          backendCiphertext: ciphertext,
          registeredBackendDescriptor: {
            ...f.bound.backendDescriptor,
            key: "platform-state",
          },
        },
      },
    ],
  });
  const checked = await f.check();
  expect(f.runner).not.toHaveBeenCalled();
  expect(f.current.mock.calls[0]?.[0]).toMatchObject({
    descriptor: { key: f.bound.stateKey },
    credentials: { accessKeyId: secret, secretAccessKey: secret },
  });
  const plaintext = f.deps.crypto
    .decrypt(
      Buffer.from(checked.reviewToken, "base64"),
      f.session.tenantId,
      f.session.id,
      `application-replan:${f.bound.jobId}`,
    )
    .toString("utf8");
  for (const value of [
    secret,
    ciphertext,
    "backendCiphertext",
    "registeredBackendDescriptor",
  ]) {
    expect(JSON.stringify(checked)).not.toContain(value);
    expect(plaintext).not.toContain(value);
  }
});
it("rejects ciphertext encrypted for another backend before any S3 call", async () => {
  const f = fixture();
  const ciphertext = f.deps.crypto
    .encrypt(
      Buffer.from(
        JSON.stringify({ accessKeyId: secret, secretAccessKey: secret }),
      ),
      f.session.tenantId,
      randomUUID(),
      `backend:${f.bound.backendId}`,
    )
    .toString("hex");
  f.query.mockResolvedValueOnce({
    rows: [{ context: { ...f.bound, backendCiphertext: ciphertext } }],
  });
  await expect(f.check()).rejects.toBeDefined();
  expect(f.runner).not.toHaveBeenCalled();
  expect(f.current).not.toHaveBeenCalled();
});
it("rejects expiration occurring during the approval's S3 observations without recording a receipt", async () => {
  const f = fixture();
  const checked = await f.check();
  vi.useFakeTimers();
  f.current.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date(Date.parse(checked.expiresAt) + 1));
    return f.snapshot();
  });
  await expect(f.approve(f.request(checked.reviewToken))).rejects.toMatchObject(
    { code: "application_recovery_replan_changed" },
  );
  expect(
    f.query.mock.calls.every(
      ([sql]) => !sql.includes("record_application_recovery_replan"),
    ),
  ).toBe(true);
});
