import { randomBytes, randomUUID } from "node:crypto";
import {
  type ApplicationStateRecoveryView,
  applicationStateRecoveryAssessRequestSchema,
  applicationStateRecoveryBlockerSchema,
  applicationStateRecoveryCommitRequestSchema,
  applicationStateRecoveryViewSchema,
  s3BackendDescriptorSchema,
  s3RunnerBackendSchema,
} from "@lzc/contracts";
import {
  decodeRecoveryArtifact,
  deriveApplicationRecoveryImports,
  deriveApplicationRecoveryRevocations,
  encodeRecoveryArtifact,
  normalizeRevokedRecoveryInventory,
  readRecoveryState,
  recoveryArtifactSchema,
  recoveryCloudInventorySchema,
  recoveryRevocationStep,
  recoveryRevocationsAbsent,
  verifyImportedRecoveryState,
  verifyRecoveryPreview,
} from "@lzc/contracts/recovery";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { tokenHash } from "../auth/store.js";
import type { PostgresCredentialProfiles } from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import type { Backends } from "../deployments/backends.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { canonicalJson, sha256 } from "../plans/execution.js";
import { withTenant } from "../storage/database.js";
import { StackitRecoveryCloud } from "./recovery-cloud.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const opaqueId = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
const contextSchema = z.object({
  recoveryId: z.uuid(),
  jobId: z.uuid(),
  instanceId: z.uuid(),
  phase: z.string(),
  runnerAppId: z.uuid(),
  bindingSha256: hash,
  runnerPackageId: z.uuid(),
  backendId: z.uuid(),
  backendSha256: hash,
  backendDescriptor: s3BackendDescriptorSchema,
  credentialProfileId: z.uuid(),
  credentialVersion: z.number().int().positive(),
  credentialKeyId: z.string().min(1),
  credentialOwnerId: z.uuid().optional(),
  serviceAccount: z.string().min(1).optional(),
  organizationId: z.uuid(),
  sourceRevision: z.enum([
    "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
    "08ac257de1548c8ec5e83dae1a79373711c3d644",
  ]),
  originalInputs: z.object({ variables: z.record(z.string(), z.json()) }),
  backendCiphertext: z.string().regex(/^[a-f0-9]+$/),
  finishedAt: z.iso.datetime({ offset: true }),
  originalCreatedAt: z.iso.datetime({ offset: true }),
});
type Context = z.infer<typeof contextSchema>;
const lockSchema = z.object({
  ID: opaqueId,
  Operation: z.literal("OperationTypeApply"),
  Version: z.literal("1.12.6"),
  Path: z.string(),
  Created: z.iso.datetime({ offset: true }),
});
const privateSchema = z.object({
  fingerprint: hash,
  original: recoveryArtifactSchema,
  stateIdentity: z.string().min(1).max(1024),
  lock: z
    .strictObject({
      id: opaqueId,
      artifact: recoveryArtifactSchema,
      identity: z.string().min(1).max(1024),
    })
    .nullable(),
  inventory: z.unknown(),
  inventorySha256: hash,
  candidate: recoveryArtifactSchema.optional(),
  preview: recoveryArtifactSchema.optional(),
});
type Private = z.infer<typeof privateSchema>;
type Row = {
  id: string;
  job_id: string;
  instance_id: string;
  phase: string;
  tenant_id: string;
  created_at: Date;
  expires_at: Date;
  public_view: unknown;
  private_ciphertext: Buffer | null;
  can_review: boolean;
};
type Task = {
  id: string;
  recovery_id: string;
  mode: "prepare" | "commit";
  runner_app_id: string | null;
  runner_package_id: string | null;
  expires_at: Date;
  input_ciphertext: Buffer;
  input_released_at: Date | null;
  finished_at: Date | null;
};
export class StateRecoveryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
function fail(code = "changed", status = 409): never {
  throw new StateRecoveryError(status, `application_state_recovery_${code}`);
}
const fingerprint = (c: Context) =>
  sha256(
    canonicalJson({
      jobId: c.jobId,
      instanceId: c.instanceId,
      runnerAppId: c.runnerAppId,
      runnerPackageId: c.runnerPackageId,
      bindingSha256: c.bindingSha256,
      backendSha256: c.backendSha256,
      backendId: c.backendId,
      sourceRevision: c.sourceRevision,
      originalInputs: c.originalInputs,
      organizationId: c.organizationId,
      credentialProfileId: c.credentialProfileId,
      credentialVersion: c.credentialVersion,
      credentialKeyId: c.credentialKeyId,
    }),
  );
const inventoryHash = (value: unknown) => {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v
          .map(normalize)
          .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [k, normalize(x)]),
          )
        : v;
  return sha256(
    canonicalJson(normalize(recoveryCloudInventorySchema.parse(value))),
  );
};

export class ApplicationStateRecoveries {
  constructor(
    private readonly deps: {
      pool: pg.Pool;
      profiles: Pick<PostgresCredentialProfiles, "verifyForPreparation"> &
        Partial<Pick<PostgresCredentialProfiles, "verifyDelegated">>;
      secrets: Pick<CredentialSecrets, "get">;
      backends: Pick<Backends, "read">;
      runner: PlanRunner;
      crypto: ArtifactCrypto;
      origin: string;
      cloud?: Pick<StackitRecoveryCloud, "read"> &
        Partial<Pick<StackitRecoveryCloud, "revoke" | "findProject">>;
    },
  ) {}
  private work<T>(session: Session, fn: (client: pg.PoolClient) => Promise<T>) {
    return withTenant(this.deps.pool, session, async (client) => {
      await client.query(
        "SELECT lzc_auth.authorize_application($1,$2,'read')",
        [session.id, session.tenantId],
      );
      return fn(client);
    });
  }
  private async row(session: Session, id: string) {
    const row = await this.work(
      session,
      async (client) =>
        (
          await client.query<Row>(
            "SELECT r.*,((r.owner_user_id=$2 AND (lzc.application_role('application-owner') OR lzc.application_role('platform-engineer'))) OR (r.reviewed_by=$2 AND lzc.application_role('platform-engineer'))) AS can_review FROM lzc.application_state_recoveries r WHERE id=$1",
            [z.uuid().parse(id), session.userId],
          )
        ).rows[0],
    );
    if (!row) fail("not_found", 404);
    return row;
  }
  private view(row: Row): ApplicationStateRecoveryView {
    const expired = row.expires_at.getTime() <= Date.now();
    return applicationStateRecoveryViewSchema.parse({
      ...(row.public_view as object),
      id: row.id,
      jobId: row.job_id,
      instanceId: row.instance_id,
      phase: row.phase,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      requiresPlatformEngineerReview: false,
      canInspect:
        row.can_review &&
        ["assessing", "committing", "reconciliation-required"].includes(
          row.phase,
        ),
      canAssess: row.can_review && row.phase === "requested" && !expired,
      canCommit: row.can_review && row.phase === "prepared" && !expired,
    });
  }
  private async context(session: Session, id: string) {
    return this.work(session, async (client) =>
      contextSchema.parse(
        (
          await client.query<{ context: unknown }>(
            "SELECT lzc_auth.application_state_recovery_context($1,$2) AS context",
            [session.id, id],
          )
        ).rows[0]?.context,
      ),
    );
  }
  private seal(session: Session, id: string, value: unknown) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > 24 * 1024 * 1024) fail("unavailable");
    return this.deps.crypto.encrypt(
      bytes,
      session.tenantId,
      id,
      `application-state-recovery:${id}`,
    );
  }
  private open(session: Session, row: Row): Private {
    if (!row.private_ciphertext) fail();
    return privateSchema.parse(
      JSON.parse(
        this.deps.crypto
          .decrypt(
            row.private_ciphertext,
            session.tenantId,
            row.id,
            `application-state-recovery:${row.id}`,
          )
          .toString("utf8"),
      ),
    );
  }
  async latest(session: Session, jobId: string) {
    const id = await this.work(
      session,
      async (client) =>
        (
          await client.query<{ id: string }>(
            "SELECT id FROM lzc.application_state_recoveries WHERE job_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
            [z.uuid().parse(jobId)],
          )
        ).rows[0]?.id,
    );
    return { recovery: id ? this.view(await this.row(session, id)) : null };
  }
  async get(session: Session, id: string) {
    return this.view(await this.row(session, id));
  }
  async request(session: Session, jobId: string, input: unknown) {
    const request = applicationStateRecoveryAssessRequestSchema.parse(input);
    const job = await this.work(
      session,
      async (client) =>
        (
          await client.query<{ instance_id: string }>(
            "SELECT instance_id FROM lzc.application_jobs WHERE id=$1",
            [z.uuid().parse(jobId)],
          )
        ).rows[0],
    );
    if (!job) fail("not_found", 404);
    const id = randomUUID();
    const view: ApplicationStateRecoveryView = {
      id,
      jobId,
      instanceId: job.instance_id,
      phase: "requested",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      blockers: [],
      originalStateSha256: null,
      candidateStateSha256: null,
      originalSerial: null,
      orphanLockId: null,
      candidateSerial: null,
      retainedResources: 0,
      credentialRevocations: [],
      imports: [],
      preview: null,
      requiresPlatformEngineerReview: false,
      canAssess: false,
      canCommit: false,
      canInspect: false,
      startsInfrastructureApply: false,
      requiresFreshPlan: true,
    };
    const row = await this.work(
      session,
      async (client) =>
        (
          await client.query<{ id: string }>(
            "SELECT * FROM lzc_auth.request_application_state_recovery($1,$2,$3,$4,$5::jsonb)",
            [
              session.id,
              jobId,
              id,
              request.idempotencyKey,
              JSON.stringify(view),
            ],
          )
        ).rows[0],
    );
    if (!row) fail();
    return this.get(session, row.id);
  }
  private async stopped(c: Context) {
    if (!this.deps.runner.isStopped) fail("unavailable", 503);
    for (let i = 0; i < 2; i++)
      if (
        !(await this.deps.runner.isStopped(
          c.jobId,
          c.runnerAppId,
          c.runnerPackageId,
        ))
      )
        fail("runner_active");
  }
  private backend(session: Session, c: Context) {
    return s3RunnerBackendSchema.parse({
      kind: "s3",
      descriptor: c.backendDescriptor,
      credentials: JSON.parse(
        this.deps.crypto
          .decrypt(
            Buffer.from(c.backendCiphertext, "hex"),
            session.tenantId,
            c.backendId,
            `backend:${c.backendId}`,
          )
          .toString("utf8"),
      ),
    });
  }
  private async snapshot(
    session: Session,
    c: Context,
    validateOriginalLock = true,
  ) {
    const backend = this.backend(session, c);
    if (
      backend.descriptor.key !==
      `applications/${session.tenantId}/${c.instanceId}/terraform.tfstate`
    )
      fail();
    const read = () =>
      Promise.all([
        this.deps.backends.read(backend, backend.descriptor.key),
        this.deps.backends.read(backend, `${backend.descriptor.key}.tflock`),
      ]);
    const [state, lock] = await read();
    const [lastState, lastLock] = await read();
    if (
      !state ||
      !lastState ||
      state.identity !== lastState.identity ||
      sha256(state.bytes) !== sha256(lastState.bytes) ||
      (lock?.identity ?? null) !== (lastLock?.identity ?? null) ||
      (lock ? sha256(lock.bytes) : null) !==
        (lastLock ? sha256(lastLock.bytes) : null)
    )
      fail();
    const parsed = readRecoveryState(state.bytes, c.instanceId);
    let originalLock: Private["lock"] = null;
    if (lock && validateOriginalLock) {
      if (lock.bytes.length > 65536) fail();
      const doc = lockSchema.parse(JSON.parse(lock.bytes.toString("utf8")));
      if (
        doc.Path !== `${backend.descriptor.bucket}/${backend.descriptor.key}` ||
        Date.parse(doc.Created) > Date.parse(c.finishedAt) ||
        Date.parse(doc.Created) < Date.parse(c.originalCreatedAt)
      )
        fail();
      originalLock = {
        id: doc.ID,
        artifact: encodeRecoveryArtifact(lock.bytes),
        identity: lock.identity,
      };
    }
    return {
      original: encodeRecoveryArtifact(state.bytes),
      stateIdentity: state.identity,
      lock: originalLock,
      lockPresent: lock !== null,
      parsed,
    };
  }
  private async credential(session: Session, c: Context) {
    if (c.credentialOwnerId) {
      if (!this.deps.profiles.verifyDelegated) fail("unavailable", 503);
      const secret = await this.deps.secrets.get(
        { tenantId: session.tenantId, userId: c.credentialOwnerId },
        c.credentialProfileId,
      );
      if (
        secret.version !== c.credentialVersion ||
        secret.key.credentials.kid !== c.credentialKeyId ||
        secret.key.credentials.iss !== c.serviceAccount
      )
        fail("credential_changed");
      const check = await this.deps.profiles.verifyDelegated(
        secret.key,
        c.organizationId,
      );
      if (
        check.status !== "passed" ||
        check.organizationId !== c.organizationId
      )
        fail("credential_changed");
      if (
        fingerprint(await this.context(session, c.recoveryId)) !==
        fingerprint(c)
      )
        fail();
      return secret.key;
    }
    const verified = await this.deps.profiles.verifyForPreparation(
      session,
      c.credentialProfileId,
      c.organizationId,
    );
    if (
      verified.check.status !== "passed" ||
      verified.check.organizationId !== c.organizationId ||
      verified.version !== c.credentialVersion ||
      verified.keyId !== c.credentialKeyId
    )
      fail("credential_changed");
    const secret = await this.deps.secrets.get(session, c.credentialProfileId);
    if (
      secret.version !== c.credentialVersion ||
      secret.key.credentials.kid !== c.credentialKeyId
    )
      fail("credential_changed");
    return secret.key;
  }
  private async cloud(session: Session, c: Context, original: Buffer) {
    const state = readRecoveryState(original, c.instanceId);
    const projects = state.instances.filter(
      (i) =>
        i.address === "module.application.stackit_resourcemanager_project.this",
    );
    const vars = z
      .object({
        application: z.object({
          owner_email: z.email(),
          initial_owner_email: z.email().nullable().optional(),
          target_key: z.string(),
          custom_roles: z.array(z.unknown()).optional(),
        }),
        platform_contract: z.object({
          organization_id: z.uuid().optional(),
          targets: z.record(
            z.string(),
            z.object({
              folder_id: z.string().min(1),
              region: z.enum(["eu01", "eu02"]),
              corporate: z.boolean().optional(),
              network_area_id: z.uuid().nullable().optional(),
            }),
          ),
        }),
      })
      .parse(c.originalInputs.variables);
    const target = vars.platform_contract.targets[vars.application.target_key];
    const region = target?.region;
    if (!region || !target) fail();
    const key = await this.credential(session, c);
    const cloud = this.deps.cloud ?? new StackitRecoveryCloud();
    if (projects.length > 1) fail();
    const projectId =
      projects.length === 1
        ? z.uuid().parse(projects[0]!.instance.attributes.project_id)
        : cloud.findProject
          ? await cloud.findProject(
              { folderId: target.folder_id, instanceId: c.instanceId },
              key,
            )
          : fail("unavailable", 503);
    const inventory = await cloud.read(
      {
        projectId,
        region,
        ownerEmail:
          vars.application.initial_owner_email ?? vars.application.owner_email,
        customRoles: !!vars.application.custom_roles?.length,
        ...(target.corporate
          ? {
              routing: {
                organizationId: z
                  .uuid()
                  .parse(vars.platform_contract.organization_id),
                networkAreaId: z.uuid().parse(target.network_area_id),
                instanceId: c.instanceId,
              },
            }
          : {}),
      },
      key,
    );
    return { key, inventory };
  }
  async assess(session: Session, id: string) {
    const row = await this.row(session, id);
    if (!this.view(row).canAssess) fail();
    const c = await this.context(session, id);
    try {
      if (!this.deps.runner.supportsAccelerator?.(c.sourceRevision))
        fail("source_changed");
      await this.stopped(c);
      const state = await this.snapshot(session, c);
      const { inventory } = await this.cloud(
        session,
        c,
        decodeRecoveryArtifact(state.original),
      );
      const imports = deriveApplicationRecoveryImports({
        state: decodeRecoveryArtifact(state.original),
        variables: c.originalInputs.variables,
        inventory,
        tenantId: session.tenantId,
        instanceId: c.instanceId,
      });
      const payload: Private = {
        fingerprint: fingerprint(c),
        original: state.original,
        stateIdentity: state.stateIdentity,
        lock: state.lock,
        inventory,
        inventorySha256: inventoryHash(inventory),
      };
      const publicView = {
        ...this.view(row),
        phase: "assessing" as const,
        credentialRevocations: deriveApplicationRecoveryRevocations({
          state: decodeRecoveryArtifact(state.original),
          variables: c.originalInputs.variables,
          inventory,
          tenantId: session.tenantId,
          instanceId: c.instanceId,
        }),
        imports,
        originalStateSha256: state.original.sha256,
        originalSerial: state.parsed.state.serial,
        orphanLockId: state.lock?.id ?? null,
        retainedResources: state.parsed.instances.length,
      };
      await this.start(session, row, "prepare", payload, publicView);
    } catch (error) {
      // Dispatch may already have happened: never replace an active task here.
      const code = applicationStateRecoveryBlockerSchema.safeParse(
        error instanceof Error ? error.message : "",
      );
      if (!code.success) throw error;
      await this.work(session, (client) =>
        client.query(
          "SELECT lzc_auth.block_application_state_recovery_assessment($1,$2,$3::jsonb)",
          [
            session.id,
            id,
            JSON.stringify({
              ...this.view(row),
              phase: "blocked",
              blockers: [code.data],
            }),
          ],
        ),
      );
    }
    return this.get(session, id);
  }
  async commit(session: Session, id: string, input: unknown) {
    const request = applicationStateRecoveryCommitRequestSchema.parse(input);
    const row = await this.row(session, id);
    const view = this.view(row);
    if (
      !view.canCommit ||
      view.originalStateSha256 !== request.originalStateSha256 ||
      view.candidateStateSha256 !== request.candidateStateSha256 ||
      canonicalJson(view.credentialRevocations) !==
        canonicalJson(request.confirmCredentialRevocations)
    )
      fail();
    const c = await this.context(session, id);
    const payload = this.open(session, row);
    await this.revalidate(session, c, payload, false);
    if (!payload.candidate || !payload.preview) fail();
    await this.start(session, row, "commit", payload, {
      ...view,
      phase: "committing",
    });
    return this.get(session, id);
  }
  private async start(
    session: Session,
    row: Row,
    mode: "prepare" | "commit",
    payload: Private,
    view: ApplicationStateRecoveryView,
  ) {
    if (!this.deps.runner.startRecovery) fail("unavailable", 503);
    const id = randomUUID(),
      ticket = randomBytes(32).toString("base64url");
    await this.work(session, async (client) =>
      client.query(
        "SELECT * FROM lzc_auth.begin_application_state_recovery_task($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          session.id,
          row.id,
          id,
          mode,
          tokenHash(ticket),
          this.seal(session, row.id, payload),
          JSON.stringify(view),
        ],
      ),
    );
    try {
      await this.deps.runner.startRecovery(
        id,
        ticket,
        this.deps.origin,
        async (app, source) => {
          await this.work(session, async (client) =>
            client.query(
              "SELECT lzc_auth.bind_application_state_recovery_task($1,$2,$3,$4)",
              [session.id, id, app, source],
            ),
          );
        },
      );
    } catch {
      // The CF task creation response can be lost after dispatch. Do not repeat it.
      // No native write can proceed without the separate durable fences below.
      fail("dispatch_unknown", 503);
    }
  }
  private async revalidate(
    session: Session,
    c: Context,
    payload: Private,
    unlocked: boolean,
    allowRevoked = false,
  ) {
    if (fingerprint(c) !== payload.fingerprint) fail();
    await this.stopped(c);
    const state = await this.snapshot(session, c);
    if (
      state.original.sha256 !== payload.original.sha256 ||
      state.stateIdentity !== payload.stateIdentity ||
      (unlocked
        ? state.lock !== null
        : canonicalJson(state.lock) !== canonicalJson(payload.lock))
    )
      fail();
    const current = await this.cloud(
      session,
      c,
      decodeRecoveryArtifact(payload.original),
    );
    const revocations = allowRevoked
      ? deriveApplicationRecoveryRevocations({
          state: decodeRecoveryArtifact(payload.original),
          variables: c.originalInputs.variables,
          inventory: payload.inventory,
          tenantId: session.tenantId,
          instanceId: c.instanceId,
        })
      : [];
    if (
      inventoryHash(
        allowRevoked
          ? normalizeRevokedRecoveryInventory(
              current.inventory,
              payload.inventory,
              revocations,
            )
          : current.inventory,
      ) !== payload.inventorySha256
    )
      fail();
    return current;
  }
  private async task(ticket: string, binding: unknown) {
    const b = z
      .strictObject({
        runnerPackageId: z.uuid(),
        acceleratorRevision: z.enum([
          "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
          "08ac257de1548c8ec5e83dae1a79373711c3d644",
        ]),
        providerLockSha256: z.literal(
          "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
        ),
      })
      .parse(binding);
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) fail("invalid_ticket", 401);
    const r = (
      await this.deps.pool.query<{
        task_id: string;
        recovery_id: string;
        session_id: string;
        user_id: string;
        tenant_id: string;
        expires_at: Date;
      }>(
        "SELECT * FROM lzc_auth.resolve_application_state_recovery_task($1,$2)",
        [tokenHash(ticket), b.runnerPackageId],
      )
    ).rows[0];
    if (!r) fail("invalid_ticket", 401);
    const session: Session = {
      id: r.session_id,
      userId: r.user_id,
      tenantId: r.tenant_id,
      expiresAt: r.expires_at,
      githubId: "",
      login: "",
      csrfToken: "",
    };
    const row = await this.row(session, r.recovery_id);
    const task = await this.work(
      session,
      async (client) =>
        (
          await client.query<Task>(
            "SELECT * FROM lzc.application_state_recovery_tasks WHERE id=$1",
            [r.task_id],
          )
        ).rows[0],
    );
    if (!task) fail("invalid_ticket", 401);
    return { session, row, task, binding: b };
  }
  async input(ticket: string, binding: unknown) {
    const { session, row, task, binding: b } = await this.task(ticket, binding);
    const c = await this.context(session, row.id),
      payload = this.open(session, {
        ...row,
        private_ciphertext: task.input_ciphertext,
      });
    const current = await this.revalidate(session, c, payload, false);
    const released = await this.work(
      session,
      async (client) =>
        (
          await client.query<{ allowed: boolean }>(
            "SELECT lzc_auth.release_application_state_recovery_input($1,$2) AS allowed",
            [session.id, task.id],
          )
        ).rows[0]?.allowed,
    );
    if (!released) fail("input_consumed");
    return {
      id: task.id,
      mode: task.mode,
      tenantId: session.tenantId,
      instanceId: c.instanceId,
      sourceRevision: c.sourceRevision,
      providerLockSha256: b.providerLockSha256,
      original: payload.original,
      variables: c.originalInputs.variables,
      inventory: payload.inventory,
      key: current.key,
      ...(task.mode === "commit"
        ? {
            candidate: payload.candidate,
            approvedCandidateSha256: payload.candidate?.sha256,
            backend: this.backend(session, c),
            orphanLockId: payload.lock?.id ?? null,
          }
        : {}),
    };
  }
  async fence(ticket: string, binding: unknown, input: unknown) {
    const { step } = z
      .strictObject({
        step: z.union([
          z.enum(["unlock", "publish"]),
          z.string().regex(/^revoke:[a-f0-9]{64}$/),
        ]),
      })
      .parse(input);
    const { session, row, task } = await this.task(ticket, binding);
    if (task.mode !== "commit") fail();
    const c = await this.context(session, row.id),
      payload = this.open(session, {
        ...row,
        private_ciphertext: task.input_ciphertext,
      });
    const revocations = deriveApplicationRecoveryRevocations({
      state: decodeRecoveryArtifact(payload.original),
      variables: c.originalInputs.variables,
      inventory: payload.inventory,
      tenantId: session.tenantId,
      instanceId: c.instanceId,
    });
    const revocation = revocations.find(
      (r) => recoveryRevocationStep(r) === step,
    );
    if (step.startsWith("revoke:") && !revocation) fail();
    const current = await this.revalidate(
      session,
      c,
      payload,
      step === "publish",
      true,
    );
    if (
      !revocation &&
      !recoveryRevocationsAbsent(current.inventory, revocations)
    )
      fail();
    const allowed = await this.work(
      session,
      async (client) =>
        (
          await client.query<{ allowed: boolean }>(
            "SELECT lzc_auth.fence_application_state_recovery($1,$2,$3) AS allowed",
            [session.id, task.id, step],
          )
        ).rows[0]?.allowed,
    );
    if (!allowed) fail("intent_consumed");
    if (
      revocation &&
      !recoveryRevocationsAbsent(current.inventory, [revocation])
    ) {
      const cloud = this.deps.cloud ?? new StackitRecoveryCloud();
      if (!cloud.revoke) fail("unavailable", 503);
      await cloud.revoke(revocation, current.key);
      // HTTP success is insufficient; the subsequent fence re-reads metadata.
    }
    return { allowed: true };
  }
  private async published(session: Session, c: Context, payload: Private) {
    if (!payload.candidate || fingerprint(c) !== payload.fingerprint)
      return undefined;
    try {
      await this.stopped(c);
      const revocations = deriveApplicationRecoveryRevocations({
        state: decodeRecoveryArtifact(payload.original),
        variables: c.originalInputs.variables,
        inventory: payload.inventory,
        tenantId: session.tenantId,
        instanceId: c.instanceId,
      });
      const cloud = await this.cloud(
        session,
        c,
        decodeRecoveryArtifact(payload.original),
      );
      if (
        inventoryHash(
          normalizeRevokedRecoveryInventory(
            cloud.inventory,
            payload.inventory,
            revocations,
          ),
        ) !== payload.inventorySha256 ||
        !recoveryRevocationsAbsent(cloud.inventory, revocations)
      )
        return undefined;
      const current = await this.snapshot(session, c, false);
      const a = current.parsed.state;
      const b = readRecoveryState(
        decodeRecoveryArtifact(payload.candidate),
        c.instanceId,
      ).state;
      const withoutSerial = (state: typeof b) => {
        const { serial: _serial, ...rest } = state;
        return rest;
      };
      if (
        current.lockPresent ||
        a.serial < b.serial ||
        canonicalJson(withoutSerial(a)) !== canonicalJson(withoutSerial(b))
      )
        return undefined;
      return {
        sha256: current.original.sha256,
        serial: a.serial,
        identity: current.stateIdentity,
      };
    } catch {
      return undefined;
    }
  }
  async inspect(session: Session, id: string) {
    const row = await this.row(session, id);
    // Actual reviewer, fresh session and bound original context; never an old task ticket.
    const c = await this.context(session, id);
    if (
      !["assessing", "committing", "reconciliation-required"].includes(
        row.phase,
      )
    )
      fail();
    const task = await this.work(
      session,
      async (client) =>
        (
          await client.query<Task>(
            "SELECT * FROM lzc.application_state_recovery_tasks WHERE recovery_id=$1 ORDER BY created_at DESC LIMIT 1",
            [id],
          )
        ).rows[0],
    );
    if (!task) fail();
    const payload = this.open(session, {
      ...row,
      private_ciphertext: task.input_ciphertext,
    });
    if (task.input_released_at) {
      if (
        !task.runner_app_id ||
        !task.runner_package_id ||
        !this.deps.runner.isRecoveryStopped
      )
        fail("unavailable", 503);
      for (let i = 0; i < 2; i++)
        if (
          !(await this.deps.runner.isRecoveryStopped(
            task.id,
            task.runner_app_id,
            task.runner_package_id,
          ))
        )
          fail("runner_active");
    }
    const clearance =
      task.mode === "commit" && task.input_released_at
        ? await this.published(session, c, payload)
        : undefined;
    let beforeStateWrite = false;
    if (task.mode === "commit" && task.input_released_at && !clearance) {
      const stateIntent = await this.work(
        session,
        async (client) =>
          (
            await client.query<{ present: boolean }>(
              "SELECT lzc_auth.application_state_recovery_has_state_intent($1,$2) AS present",
              [session.id, task.id],
            )
          ).rows[0]?.present,
      );
      if (stateIntent === false) {
        try {
          await this.revalidate(session, c, payload, false, true);
          beforeStateWrite = true;
        } catch {
          /* Keep ambiguous state unresolved. */
        }
      }
    }
    const phase = clearance
      ? "committed"
      : task.mode === "prepare" || !task.input_released_at || beforeStateWrite
        ? "blocked"
        : "reconciliation-required";
    const view = {
      ...this.view(row),
      phase,
      blockers:
        phase === "committed"
          ? []
          : [
              phase === "blocked"
                ? "native-recovery-failed"
                : "commit-outcome-unknown",
            ],
    };
    if (
      row.phase === "reconciliation-required" &&
      !clearance &&
      !beforeStateWrite
    )
      return this.get(session, id);
    await this.work(session, async (client) => {
      await client.query(
        "SELECT lzc_auth.inspect_application_state_recovery_task($1,$2,$3,$4,$5::jsonb,$6)",
        [
          session.id,
          task.id,
          phase,
          this.seal(session, id, payload),
          JSON.stringify(view),
          task.input_released_at !== null,
        ],
      );
      if (clearance)
        await client.query(
          "SELECT * FROM lzc_auth.record_guided_application_recovery_replan($1,$2,$3,$4,$5,$6,$7,true)",
          [
            session.id,
            c.jobId,
            c.bindingSha256,
            c.backendSha256,
            clearance.sha256,
            clearance.serial,
            clearance.identity,
          ],
        );
    });
    if (phase !== "reconciliation-required")
      void this.deps.runner
        .removeRecovery?.(task.id, task.runner_app_id)
        .catch(() => undefined);
    return this.get(session, id);
  }
  async result(ticket: string, binding: unknown, input: unknown) {
    const request = z
      .discriminatedUnion("status", [
        z.strictObject({
          status: z.literal("prepared"),
          candidate: recoveryArtifactSchema,
          preview: recoveryArtifactSchema,
        }),
        z.strictObject({ status: z.literal("publication-requested") }),
        z.strictObject({
          status: z.literal("failed"),
          blocker: applicationStateRecoveryBlockerSchema,
        }),
      ])
      .parse(input);
    const { session, row, task } = await this.task(ticket, binding);
    const c = await this.context(session, row.id),
      payload = this.open(session, {
        ...row,
        private_ciphertext: task.input_ciphertext,
      });
    let phase: ApplicationStateRecoveryView["phase"];
    let clearance:
      | { sha256: string; serial: number; identity: string }
      | undefined;
    let view = this.view(row);
    if (task.mode === "prepare" && request.status === "prepared") {
      await this.revalidate(session, c, payload, false);
      const original = decodeRecoveryArtifact(payload.original),
        candidate = decodeRecoveryArtifact(request.candidate);
      const imports = deriveApplicationRecoveryImports({
        state: original,
        variables: c.originalInputs.variables,
        inventory: payload.inventory,
        tenantId: session.tenantId,
        instanceId: c.instanceId,
      });
      const proof = verifyImportedRecoveryState({
        original,
        candidate,
        instanceId: c.instanceId,
        imports,
        revocations: deriveApplicationRecoveryRevocations({
          state: original,
          variables: c.originalInputs.variables,
          inventory: payload.inventory,
          tenantId: session.tenantId,
          instanceId: c.instanceId,
        }),
      });
      const preview = verifyRecoveryPreview(
        JSON.parse(decodeRecoveryArtifact(request.preview).toString("utf8")),
        candidate,
        c.instanceId,
      );
      payload.candidate = request.candidate;
      payload.preview = request.preview;
      phase = "prepared";
      view = {
        ...view,
        phase,
        imports,
        preview,
        originalStateSha256: proof.originalStateSha256,
        candidateStateSha256: proof.candidateStateSha256,
        originalSerial: proof.originalSerial,
        candidateSerial: proof.candidateSerial,
        retainedResources: proof.retainedResources,
      };
    } else if (task.mode === "commit" && request.status !== "prepared") {
      clearance = task.input_released_at
        ? await this.published(session, c, payload)
        : undefined;
      phase = clearance
        ? "committed"
        : !task.input_released_at
          ? "blocked"
          : "reconciliation-required";
      view = {
        ...view,
        phase,
        blockers: phase === "committed" ? [] : ["commit-outcome-unknown"],
      };
    } else if (task.mode === "prepare" && request.status === "failed") {
      phase = "blocked";
      view = { ...view, phase, blockers: [request.blocker] };
    } else fail();
    await this.work(session, async (client) => {
      await client.query(
        "SELECT lzc_auth.finish_application_state_recovery_task($1,$2,$3,$4,$5::jsonb)",
        [
          session.id,
          task.id,
          phase,
          this.seal(session, row.id, payload),
          JSON.stringify(view),
        ],
      );
      if (clearance)
        await client.query(
          "SELECT * FROM lzc_auth.record_guided_application_recovery_replan($1,$2,$3,$4,$5,$6,$7,true)",
          [
            session.id,
            c.jobId,
            c.bindingSha256,
            c.backendSha256,
            clearance.sha256,
            clearance.serial,
            clearance.identity,
          ],
        );
    });
    // Source-bound deterministic cleanup only; a failed cleanup cannot replay a
    // native command or change the persisted recovery outcome.
    if (phase !== "reconciliation-required")
      void this.deps.runner
        .removeRecovery?.(task.id, task.runner_app_id)
        .catch(() => undefined);
    return this.get(session, row.id);
  }
}
