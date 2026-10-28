import { randomBytes, randomUUID } from "node:crypto";
import {
  deriveApplicationRecoveryImports,
  encodeRecoveryArtifact,
  readRecoveryState,
  recoveryCloudInventorySchema,
  recoveryRevocationStep,
} from "@lzc/contracts/recovery";
import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { ApplicationStateRecoveries } from "../apps/api/src/applications/state-recovery.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { canonicalJson, sha256 } from "../apps/api/src/plans/execution.js";
import { recoveryFixture } from "./fixtures/application-state-recovery.js";

function harness(lostKey = false, missingProject = false) {
  const f = recoveryFixture(),
    instance = f.variables.application.instance_id,
    tenant = f.variables.application.tenant_id;
  if (lostKey) f.inventory.serviceAccounts[0]!.keyIds.push("lost-key");
  if (missingProject) f.state.resources = f.state.resources.slice(0, 1);
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: tenant,
    expiresAt: new Date(Date.now() + 3600000),
    githubId: "test",
    login: "test",
    csrfToken: "test",
  };
  const id = randomUUID(),
    jobId = randomUUID(),
    backendId = randomUUID();
  const descriptor = {
    bucket: "test-state-bucket",
    key: `applications/${tenant}/${instance}/terraform.tfstate`,
    endpoint: "https://object.storage.eu01.onstackit.cloud",
    region: "eu01",
    useLockfile: true,
  };
  const creds = {
    accessKeyId: "synthetic-access",
    secretAccessKey: "synthetic-secret",
  };
  const context = {
    recoveryId: id,
    jobId,
    instanceId: instance,
    phase: "requested",
    runnerAppId: randomUUID(),
    runnerPackageId: randomUUID(),
    bindingSha256: "a".repeat(64),
    backendId,
    backendSha256: "b".repeat(64),
    backendDescriptor: descriptor,
    backendCiphertext: crypto
      .encrypt(
        Buffer.from(JSON.stringify(creds)),
        tenant,
        backendId,
        `backend:${backendId}`,
      )
      .toString("hex"),
    credentialProfileId: randomUUID(),
    credentialVersion: 1,
    credentialKeyId: "test-key",
    organizationId: randomUUID(),
    sourceRevision: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
    originalInputs: { variables: f.variables },
    finishedAt: new Date().toISOString(),
    originalCreatedAt: new Date(Date.now() - 60000).toISOString(),
  };
  let remote: Buffer = Buffer.from(JSON.stringify(f.state));
  let lock: Buffer | null = Buffer.from(
    JSON.stringify({
      ID: "33333333-3333-b333-5333-333333333333",
      Operation: "OperationTypeApply",
      Version: "1.12.6",
      Path: `${descriptor.bucket}/${descriptor.key}`,
      Created: new Date(Date.now() - 30000).toISOString(),
    }),
  );
  const view = {
    id,
    jobId,
    instanceId: instance,
    phase: "requested",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    blockers: [],
    originalStateSha256: null,
    candidateStateSha256: null,
    originalSerial: null,
    candidateSerial: null,
    retainedResources: 0,
    imports: [],
    preview: null,
    requiresPlatformEngineerReview: true,
    canAssess: true,
    canCommit: false,
    canInspect: false,
    startsInfrastructureApply: false,
    requiresFreshPlan: true,
  };
  const row = {
    id,
    job_id: jobId,
    instance_id: instance,
    phase: "requested",
    tenant_id: tenant,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 600000),
    public_view: view as unknown,
    private_ciphertext: null as Buffer | null,
    can_review: true,
  };
  type Task = {
    id: string;
    recovery_id: string;
    mode: string;
    input_ciphertext: Buffer;
    runner_app_id: string | null;
    runner_package_id: string | null;
    input_released_at: Date | null;
    finished_at: Date | null;
  };
  const tasks: Task[] = [];
  const intents = new Set<string>();
  const queries: string[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    queries.push(sql);
    if (sql.includes("SELECT r.*")) return { rows: [row] };
    if (sql.includes("application_state_recovery_context"))
      return { rows: [{ context }] };
    if (sql.includes("begin_application_state_recovery_task")) {
      const mode = args[3] as string;
      tasks.push({
        id: args[2] as string,
        recovery_id: id,
        mode,
        input_ciphertext: args[5] as Buffer,
        runner_app_id: null,
        runner_package_id: null,
        input_released_at: null,
        finished_at: null,
      });
      row.phase = mode === "prepare" ? "assessing" : "committing";
      row.public_view = JSON.parse(args[6] as string);
      row.private_ciphertext = args[5] as Buffer;
    }
    if (sql.includes("bind_application_state_recovery_task")) {
      const t = tasks.find((t) => t.id === args[1]);
      if (t) {
        t.runner_app_id = args[2] as string;
        t.runner_package_id = args[3] as string;
      }
    }
    if (sql.includes("resolve_application_state_recovery_task")) {
      const t = tasks.at(-1);
      return {
        rows:
          t && !t.finished_at
            ? [
                {
                  task_id: t.id,
                  recovery_id: id,
                  session_id: session.id,
                  user_id: session.userId,
                  tenant_id: tenant,
                  expires_at: session.expiresAt,
                },
              ]
            : [],
      };
    }
    if (sql.includes("SELECT * FROM lzc.application_state_recovery_tasks"))
      return { rows: [tasks.at(-1)] };
    if (sql.includes("release_application_state_recovery_input")) {
      const t = tasks.at(-1);
      if (!t || t.input_released_at) return { rows: [{ allowed: false }] };
      t.input_released_at = new Date();
      return { rows: [{ allowed: true }] };
    }
    if (sql.includes("application_state_recovery_has_state_intent"))
      return {
        rows: [
          {
            present: [...intents].some(
              (k) => k === `${args[1]}:unlock` || k === `${args[1]}:publish`,
            ),
          },
        ],
      };
    if (sql.includes("fence_application_state_recovery")) {
      const key = `${args[1]}:${args[2]}`;
      const allowed = !intents.has(key);
      intents.add(key);
      return { rows: [{ allowed }] };
    }
    if (
      sql.includes("finish_application_state_recovery_task") ||
      sql.includes("inspect_application_state_recovery_task")
    ) {
      row.phase = args[2] as string;
      row.private_ciphertext = args[3] as Buffer;
      row.public_view = JSON.parse(args[4] as string);
      const t = tasks.at(-1);
      if (t) t.finished_at = new Date();
    }
    if (sql.includes("block_application_state_recovery_assessment")) {
      row.phase = "blocked";
      row.public_view = JSON.parse(args[2] as string);
    }
    return { rows: [] };
  });
  const pool = {
    connect: async () => ({ query, release: () => {} }),
    query,
  } as unknown as pg.Pool;
  const read = vi.fn(async (_backend: unknown, key: string) =>
    key.endsWith(".tflock")
      ? lock && { bytes: lock, identity: sha256(lock) }
      : { bytes: remote, identity: sha256(remote) },
  );
  const key = { credentials: { kid: "test-key" } };
  const profiles = {
    verifyForPreparation: vi.fn(async () => ({
      version: 1,
      keyId: "test-key",
      check: { status: "passed", organizationId: context.organizationId },
    })),
  };
  const secrets = { get: vi.fn(async () => ({ version: 1, key })) };
  const cloud = {
    findProject: vi.fn(async () => f.inventory.project.projectId),
    revoke: vi.fn(async (_revocation: unknown, _key: unknown) => {
      f.inventory.serviceAccounts[0]!.keyIds = [];
    }),
    read: vi.fn(async () => recoveryCloudInventorySchema.parse(f.inventory)),
  };
  const isStopped = vi.fn(async () => true),
    isRecoveryStopped = vi.fn(async () => true),
    removeRecovery = vi.fn(async () => {});
  let ticket = "";
  const startRecovery = vi.fn(
    async (
      _id: string,
      t: string,
      _origin: string,
      record: (a: string, p: string) => Promise<void>,
    ) => {
      ticket = t;
      await record(randomUUID(), randomUUID());
    },
  );
  const runner = {
    isStopped,
    isRecoveryStopped,
    removeRecovery,
    startRecovery,
    supportsAccelerator: () => true,
    start: vi.fn(),
    remove: vi.fn(),
  };
  const service = new ApplicationStateRecoveries({
    pool,
    profiles: profiles as never,
    secrets: secrets as never,
    backends: { read },
    runner,
    crypto,
    origin: "https://test.invalid",
    cloud,
  });
  const binding = () => ({
    runnerPackageId: tasks.at(-1)?.runner_package_id,
    acceleratorRevision: context.sourceRevision,
    providerLockSha256:
      "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
  });
  const imports = deriveApplicationRecoveryImports({
    state: remote,
    variables: f.variables,
    inventory: f.inventory,
    tenantId: tenant,
    instanceId: instance,
  });
  const candidateDoc = JSON.parse(remote.toString());
  candidateDoc.serial += Number(imports.length > 0);
  for (const i of imports) {
    const part = i.address.slice("module.application.".length);
    const type = part.split(".")[0];
    if (!type) throw new Error("missing type");
    const tail = part.slice(type.length + 1);
    const name = tail.split("[")[0];
    if (!name) throw new Error("missing name");
    const suffix = tail.slice(name.length);
    candidateDoc.resources.push({
      module: "module.application",
      mode: "managed",
      type,
      name,
      provider: "stackit",
      instances: [
        {
          ...(suffix ? { index_key: JSON.parse(suffix.slice(1, -1)) } : {}),
          attributes: { id: i.resourceId },
        },
      ],
    });
  }
  const candidate = Buffer.from(JSON.stringify(candidateDoc));
  const preview = Buffer.from(
    JSON.stringify({
      resource_changes: readRecoveryState(candidate, instance).instances.map(
        (i) => ({
          address: i.address,
          mode: "managed",
          change: { actions: ["no-op"] },
        }),
      ),
    }),
  );
  const prepared = async () => {
    await service.assess(session, id);
    await service.input(ticket, binding());
    await service.result(ticket, binding(), {
      status: "prepared",
      candidate: encodeRecoveryArtifact(candidate),
      preview: encodeRecoveryArtifact(preview),
    });
  };
  const commit = async (confirmCredentialRevocations: unknown[] = []) =>
    service.commit(session, id, {
      originalStateSha256: sha256(Buffer.from(JSON.stringify(f.state))),
      candidateStateSha256: sha256(candidate),
      confirmCredentialRevocations,
      confirmStateRepair: true,
      confirmExactOrphanLockRelease: true,
      confirmFreshPlanRequired: true,
    });
  return {
    f,
    service,
    session,
    id,
    row,
    context,
    queries,
    query,
    read,
    profiles,
    secrets,
    cloud,
    runner,
    tasks,
    binding,
    get ticket() {
      return ticket;
    },
    candidate,
    preview,
    prepared,
    commit,
    setRemote: (bytes: Buffer) => {
      remote = bytes;
    },
    setLock: (bytes: Buffer | null) => {
      lock = bytes;
    },
  };
}
describe("guided recovery broker and independent publication proof", () => {
  it("prepares a read-only proposal, releases input once, independently confirms publication and enables only fresh planning", async () => {
    const h = harness();
    await h.prepared();
    const publicView = await h.service.get(h.session, h.id);
    expect(publicView).toMatchObject({
      phase: "prepared",
      canCommit: true,
      imports: expect.any(Array),
    });
    expect(JSON.stringify(publicView)).not.toMatch(
      /synthetic-secret|input_ciphertext|terraform_version|backendCiphertext/,
    );
    expect(
      h.queries.some((s) =>
        s.includes("record_guided_application_recovery_replan"),
      ),
    ).toBe(false);
    await h.commit();
    await h.service.input(h.ticket, h.binding());
    await expect(h.service.input(h.ticket, h.binding())).rejects.toMatchObject({
      code: "application_state_recovery_input_consumed",
    });
    await h.service.fence(h.ticket, h.binding(), { step: "unlock" });
    h.setLock(null);
    await h.service.fence(h.ticket, h.binding(), { step: "publish" });
    h.setRemote(h.candidate);
    expect(
      await h.service.result(h.ticket, h.binding(), {
        status: "publication-requested",
      }),
    ).toMatchObject({ phase: "committed" });
    expect(
      h.queries.filter((s) =>
        s.includes("record_guided_application_recovery_replan"),
      ),
    ).toHaveLength(1);
  });
  it.each(["old-state", "foreign-lock", "foreign-state"])(
    "does not trust worker success with %s",
    async (kind) => {
      const h = harness();
      await h.prepared();
      await h.commit();
      await h.service.input(h.ticket, h.binding());
      if (kind !== "old-state") h.setRemote(h.candidate);
      if (kind !== "foreign-lock") h.setLock(null);
      if (kind === "foreign-state") {
        const s = JSON.parse(h.candidate.toString());
        s.lineage = randomUUID();
        h.setRemote(Buffer.from(JSON.stringify(s)));
      }
      expect(
        await h.service.result(h.ticket, h.binding(), {
          status: "publication-requested",
        }),
      ).toMatchObject({ phase: "reconciliation-required", canCommit: false });
      expect(
        h.queries.some((s) =>
          s.includes("record_guided_application_recovery_replan"),
        ),
      ).toBe(false);
    },
  );
  it("keeps the proposal valid when list ordering changes", async () => {
    const h = harness();
    h.f.inventory.roleAssignments.push({
      ...h.f.inventory.roleAssignments[0]!,
      role: "owner",
    });
    await h.prepared();
    h.cloud.read.mockImplementation(async () =>
      recoveryCloudInventorySchema.parse({
        ...structuredClone(h.f.inventory),
        roleAssignments: [...h.f.inventory.roleAssignments].reverse(),
      }),
    );
    await expect(h.commit()).resolves.toMatchObject({ phase: "committing" });
  });
  it("invalidates a proposal after a credential change before dispatch", async () => {
    const h = harness();
    await h.prepared();
    h.profiles.verifyForPreparation.mockResolvedValueOnce({
      version: 2,
      keyId: "test-key",
      check: { status: "passed", organizationId: h.context.organizationId },
    });
    await expect(h.commit()).rejects.toMatchObject({
      code: "application_state_recovery_credential_changed",
    });
    expect(h.runner.startRecovery).toHaveBeenCalledTimes(1);
  });
  it("rejects altered imported State before persisting a proposal", async () => {
    const h = harness();
    await h.service.assess(h.session, h.id);
    await h.service.input(h.ticket, h.binding());
    const s = JSON.parse(h.candidate.toString());
    s.resources[1].instances[0].attributes.container_id = "altered";
    await expect(
      h.service.result(h.ticket, h.binding(), {
        status: "prepared",
        candidate: encodeRecoveryArtifact(Buffer.from(JSON.stringify(s))),
        preview: encodeRecoveryArtifact(h.preview),
      }),
    ).rejects.toThrow("checkpoint-changed");
    expect(h.row.phase).toBe("assessing");
  });
  it("stores a useful blocker for an ambiguous cloud match", async () => {
    const h = harness();
    h.f.inventory.networks.push(structuredClone(h.f.inventory.networks[0]!));
    expect(await h.service.assess(h.session, h.id)).toMatchObject({
      phase: "blocked",
      blockers: ["cloud-resource-ambiguous"],
    });
    expect(h.runner.startRecovery).not.toHaveBeenCalled();
  });
  it("inspects an uncertain dispatch without repeating it or releasing credentials", async () => {
    const h = harness();
    h.runner.startRecovery.mockRejectedValueOnce(new Error("response lost"));
    await expect(h.service.assess(h.session, h.id)).rejects.toMatchObject({
      code: "application_state_recovery_dispatch_unknown",
    });
    expect(await h.service.inspect(h.session, h.id)).toMatchObject({
      phase: "blocked",
    });
    expect(h.secrets.get).toHaveBeenCalledTimes(1);
    expect(h.runner.startRecovery).toHaveBeenCalledTimes(1);
    expect(
      h.queries.some((s) =>
        s.includes("record_guided_application_recovery_replan"),
      ),
    ).toBe(false);
  });
  it("requires independently stopped recovery task before inspecting a lost commit result", async () => {
    const h = harness();
    await h.prepared();
    await h.commit();
    await h.service.input(h.ticket, h.binding());
    h.setRemote(h.candidate);
    h.setLock(null);
    h.runner.isRecoveryStopped.mockResolvedValueOnce(false);
    await expect(h.service.inspect(h.session, h.id)).rejects.toMatchObject({
      code: "application_state_recovery_runner_active",
    });
    expect(h.row.phase).toBe("committing");
    expect(h.runner.startRecovery).toHaveBeenCalledTimes(2);
    expect(await h.service.inspect(h.session, h.id)).toMatchObject({
      phase: "committed",
    });
    expect(h.runner.startRecovery).toHaveBeenCalledTimes(2);
  });
  it("never dispatches another task when an uncertain result still has original State", async () => {
    const h = harness();
    await h.prepared();
    await h.commit();
    await h.service.input(h.ticket, h.binding());
    await h.service.fence(h.ticket, h.binding(), { step: "unlock" });
    expect(await h.service.inspect(h.session, h.id)).toMatchObject({
      phase: "reconciliation-required",
    });
    expect(await h.service.inspect(h.session, h.id)).toMatchObject({
      phase: "reconciliation-required",
    });
    expect(h.runner.removeRecovery).toHaveBeenCalledTimes(1); // only completed proposal task
    expect(h.runner.startRecovery).toHaveBeenCalledTimes(2);
    expect(
      h.queries.filter((s) =>
        s.includes("inspect_application_state_recovery_task"),
      ),
    ).toHaveLength(1);
  });
});

it("requires exact lost-key consent and revokes once before unlocking or publishing", async () => {
  const h = harness(true);
  await h.prepared();
  const proposal = await h.service.get(h.session, h.id);
  expect(proposal.credentialRevocations).toHaveLength(1);
  await expect(h.commit()).rejects.toBeDefined();
  await h.commit(proposal.credentialRevocations);
  await h.service.input(h.ticket, h.binding());
  await expect(
    h.service.fence(h.ticket, h.binding(), { step: "unlock" }),
  ).rejects.toBeDefined();
  expect(h.cloud.revoke).not.toHaveBeenCalled();
  const revoke = proposal.credentialRevocations[0]!;
  await expect(
    h.service.fence(h.ticket, h.binding(), {
      step: `revoke:${"0".repeat(64)}`,
    }),
  ).rejects.toBeDefined();
  await h.service.fence(h.ticket, h.binding(), {
    step: recoveryRevocationStep(revoke),
  });
  expect(h.cloud.revoke).toHaveBeenCalledOnce();
  expect(h.cloud.revoke.mock.calls[0]?.[0]).toEqual(revoke);
  await expect(
    h.service.fence(h.ticket, h.binding(), {
      step: recoveryRevocationStep(revoke),
    }),
  ).rejects.toBeDefined();
  await h.service.fence(h.ticket, h.binding(), { step: "unlock" });
  h.setLock(null);
  await h.service.fence(h.ticket, h.binding(), { step: "publish" });
  h.setRemote(h.candidate);
  await h.service.result(h.ticket, h.binding(), {
    status: "publication-requested",
  });
  expect((await h.service.get(h.session, h.id)).phase).toBe("committed");
});
it("can abandon an interrupted credential-only repair after stopped-task and unchanged State/lock proof without retrying a deletion", async () => {
  const h = harness(true);
  await h.prepared();
  const proposal = await h.service.get(h.session, h.id);
  await h.commit(proposal.credentialRevocations);
  await h.service.input(h.ticket, h.binding());
  await h.service.fence(h.ticket, h.binding(), {
    step: recoveryRevocationStep(proposal.credentialRevocations[0]!),
  });
  await h.service.result(h.ticket, h.binding(), {
    status: "failed",
    blocker: "commit-outcome-unknown",
  });
  expect((await h.service.inspect(h.session, h.id)).phase).toBe("blocked");
  expect(h.cloud.revoke).toHaveBeenCalledOnce();
  expect(h.runner.isRecoveryStopped).toHaveBeenCalledTimes(2);
});

it("discovers the exact bound project when its creation did not reach State", async () => {
  const h = harness(false, true);
  await h.prepared();
  expect(h.cloud.findProject).toHaveBeenCalledWith(
    {
      folderId: h.f.variables.platform_contract.targets.public.folder_id,
      instanceId: h.f.variables.application.instance_id,
    },
    expect.anything(),
  );
  expect(
    (await h.service.get(h.session, h.id)).imports.some(
      (i) => i.type === "stackit_resourcemanager_project",
    ),
  ).toBe(true);
});

it.each([
  "c4b43c36af198985980b17626c48d357795e3fbd",
  "88149782bf8e91dcdbb43a203b54337886023f7f",
  "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f",
  "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
  "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  "08ac257de1548c8ec5e83dae1a79373711c3d644",
])(
  "keeps original historical source %s through API context and native task binding",
  async (source) => {
    const h = harness();
    h.context.sourceRevision = source;
    await h.service.assess(h.session, h.id);
    const input = await h.service.input(h.ticket, h.binding());
    expect(input).toMatchObject({ sourceRevision: source });
    expect(h.binding().acceleratorRevision).toBe(source);
  },
);
