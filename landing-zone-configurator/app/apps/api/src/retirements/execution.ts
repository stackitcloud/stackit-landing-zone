import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  retirementApplyRequestSchema,
  retirementExecutionReviewSchema,
  retirementOutputSchema,
  retirementPlanFailureCodeSchema,
  retirementPlanRequestSchema,
} from "@lzc/contracts";
import {
  assertRetirementProtectedResources,
  retirementInventory,
  retirementInventorySchema,
  retirementPlanProjection,
  retirementPrivateTargets,
  retirementStateSha256,
  retirementWorkerInputSchema,
  type StackitRetirementCloud,
  verifyRetirementApply,
  verifyRetirementPlan,
  verifyRetirementState,
} from "@lzc/contracts/recovery";
import type pg from "pg";
import { z } from "zod";
import { type Session, tokenHash } from "../auth/store.js";
import {
  CredentialError,
  type PostgresCredentialProfiles,
} from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import { type ArtifactCrypto, canonicalBase64 } from "../plans/crypto.js";
import { withTenant } from "../storage/database.js";
import { retirementSourceInputs } from "./source-inputs.js";

const fail = (code: string, status = 409) => new CredentialError(status, code);
const bytes = z.preprocess(
  (value) =>
    typeof value === "string" && /^\\x[0-9a-f]+$/i.test(value)
      ? Buffer.from(value.slice(2), "hex")
      : value,
  z.instanceof(Buffer),
);
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const json = z.record(z.string(), z.json());
const templateSchema = retirementWorkerInputSchema.omit({
  key: true,
  backend: true,
  plan: true,
});
const scopeSchema = z.object({
  id: z.uuid(),
  retirement_id: z.uuid(),
  instance_id: z.uuid().nullable(),
  stage: z.enum([
    "private_workloads",
    "remove_application",
    "remove_projects",
    "finalize_folders",
    "complete",
  ]),
  current_state_ciphertext: bytes,
  current_state_sha256: z.string(),
  state_version: z.coerce.number().int().positive(),
});
const inventorySchema = z.object({
  id: z.uuid(),
  generation: z.coerce.number().int().positive(),
  scope_key: z.string(),
  inventory_ciphertext: bytes,
  source_ciphertext: bytes,
});
const grantSchema = z.object({
  id: z.uuid(),
  operator_id: z.uuid(),
  credential_profile_id: z.uuid(),
  credential_version: z.coerce.number().int().positive(),
  credential_key_id: z.string(),
  cleanup_project_id: z.uuid(),
  witness_ciphertext: bytes,
});
const contextSchema = z.object({
  retirementId: z.uuid(),
  generation: z.coerce.number().int().positive(),
  organizationId: z.uuid(),
  notBefore: z.string(),
  scope: scopeSchema,
  inventory: inventorySchema,
  grant: grantSchema,
});
const jobSchema = z.object({
  id: z.uuid(),
  retirement_id: z.uuid(),
  scope_id: z.uuid(),
  generation: z.coerce.number().int().positive(),
  operator_id: z.uuid(),
  issuer_session_id: z.uuid(),
  operation: z.enum(["plan", "apply"]),
  phase: z.enum([
    "private_workloads",
    "remove_application",
    "remove_projects",
    "finalize_folders",
  ]),
  source_revision: z.string(),
  provider_lock_sha256: z.string(),
  variables_sha256: z.string(),
  binding_sha256: z.string(),
  input_ciphertext: bytes,
  before_state_ciphertext: bytes,
  state_version: z.coerce.number().int().positive(),
  status: z.string(),
  native_status: z.enum(["succeeded", "failed"]).nullable(),
  runner_app_id: z.uuid().nullable(),
  runner_package_id: z.uuid().nullable(),
  artifact_ciphertext: bytes.nullable(),
  artifact_sha256: z.string().nullable(),
  plan_id: z.uuid().nullable(),
  projection: z.unknown().nullable(),
  recovery_ciphertext: bytes.nullable(),
  result: z.unknown().nullable(),
  expires_at: z.coerce.date(),
  stopped_at: z.coerce.date().nullable(),
});
const runnerContextSchema = z.object({
  job: jobSchema,
  scope: scopeSchema,
  inventory: inventorySchema,
  grant: grantSchema,
  organizationId: z.uuid(),
  plan: jobSchema.nullable(),
});
const resultSchema = z.strictObject({
  status: z.enum(["succeeded", "failed"]),
  stateSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  removed: z.array(z.unknown()).optional(),
  completedDeletes: z.array(z.string()).max(20000).optional(),
  recoveryRequired: z.literal(true).optional(),
  errorCode: z
    .enum([
      "retirement_folder_purge_pending",
      "retirement_native_apply_failed",
      "retirement_apply_outcome_unconfirmed",
      "retirement_native_plan_failed",
      "retirement_plan_outcome_unconfirmed",
      "retirement_runner_stopped_before_apply",
    ])
    .or(retirementPlanFailureCodeSchema)
    .nullable()
    .optional(),
});
/** Separate, source-bound destruction capability. No requester identity is borrowed. */
export class RetirementExecution {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: ArtifactCrypto,
    private readonly profiles: Pick<
      PostgresCredentialProfiles,
      "verifyForPreparation"
    >,
    private readonly secrets: CredentialSecrets,
    private readonly cloud: Pick<
      StackitRetirementCloud,
      "control" | "targets" | "folderChildren"
    >,
    private readonly controlProjectIds: readonly string[],
    private readonly runner: PlanRunner,
    private readonly origin: string,
  ) {
    z.array(z.uuid()).min(1).max(32).parse(controlProjectIds);
    if (
      !runner.retirementEnabled ||
      !runner.preview ||
      !runner.supportsRetirement ||
      !runner.supportsArtifact ||
      !runner.isStopped
    )
      throw Error("Qualified retirement runner required");
  }
  private decrypt(
    identity: Pick<Session, "tenantId">,
    retirementId: string,
    cipher: Buffer,
    aad: string,
  ) {
    return this.crypto.decrypt(cipher, identity.tenantId, retirementId, aad);
  }
  private opened(
    identity: Pick<Session, "tenantId">,
    context: z.infer<typeof contextSchema>,
  ) {
    const { scope, inventory, retirementId } = context;
    const aad = `retirement:${retirementId}:${inventory.generation}:${inventory.scope_key}`;
    const baseline = retirementInventorySchema.parse(
      JSON.parse(
        this.decrypt(
          identity,
          retirementId,
          inventory.inventory_ciphertext,
          `${aad}:inventory`,
        ).toString("utf8"),
      ),
    );
    const source = json.parse(
      JSON.parse(
        this.decrypt(
          identity,
          retirementId,
          inventory.source_ciphertext,
          `${aad}:source`,
        ).toString("utf8"),
      ),
    );
    const state = JSON.parse(
      this.decrypt(
        identity,
        retirementId,
        scope.current_state_ciphertext,
        `retirement-state:${scope.id}`,
      ).toString("utf8"),
    );
    if (retirementStateSha256(state) !== scope.current_state_sha256)
      throw fail("retirement_state_changed");
    const before = retirementInventory(state, { includePrivate: true });
    verifyRetirementState(before, baseline);
    return { baseline, source, before, state };
  }
  private template(
    identity: Pick<Session, "tenantId">,
    job: z.infer<typeof jobSchema>,
  ) {
    return templateSchema.parse(
      JSON.parse(
        this.decrypt(
          identity,
          job.retirement_id,
          job.input_ciphertext,
          `retirement-job:${job.id}:input`,
        ).toString("utf8"),
      ),
    );
  }
  private async context(
    session: Session,
    id: string,
    generation: number,
    scope: string,
  ) {
    return withTenant(this.pool, session, async (c) =>
      contextSchema.parse(
        (
          await c.query(
            "SELECT lzc_auth.retirement_scope_context($1,$2,$3,$4) AS value",
            [session.id, id, generation, scope],
          )
        ).rows[0].value,
      ),
    );
  }
  private async credential(
    session: Session,
    context: z.infer<typeof contextSchema>,
  ) {
    const grant = context.grant;
    const check = await this.profiles.verifyForPreparation(
      session,
      grant.credential_profile_id,
      context.organizationId,
    );
    const secret = await this.secrets.get(session, grant.credential_profile_id);
    if (
      check.check.status !== "passed" ||
      check.check.organizationId !== context.organizationId ||
      check.version !== grant.credential_version ||
      check.keyId !== grant.credential_key_id ||
      secret.version !== grant.credential_version ||
      secret.key.credentials.kid !== grant.credential_key_id
    )
      throw fail("retirement_cleanup_identity_unverified");
    const { baseline, before } = this.opened(session, context);
    const witness = z
      .object({ projectIds: z.array(z.uuid()), folderIds: z.array(z.uuid()) })
      .parse(
        JSON.parse(
          this.decrypt(
            session,
            context.retirementId,
            context.grant.witness_ciphertext,
            `retirement-control:${context.generation}`,
          ).toString("utf8"),
        ),
      );
    if (
      baseline.resources.some(
        (r) =>
          (r.type === "stackit_resourcemanager_project" &&
            !witness.projectIds.includes(String(r.id))) ||
          (r.type === "stackit_resourcemanager_folder" &&
            !witness.folderIds.includes(String(r.id))),
      )
    )
      throw fail("retirement_inventory_changed");

    await this.cloud.control(
      {
        organizationId: context.organizationId,
        cleanupProjectId: grant.cleanup_project_id,
        controlProjectIds: [...this.controlProjectIds],
        targetProjectIds: witness.projectIds,
        targetFolderIds: witness.folderIds,
      },
      secret.key,
    );
    const currentFolders = context.scope.instance_id
      ? witness.folderIds
      : before.resources
          .filter((r) => r.type === "stackit_resourcemanager_folder")
          .map((r) => z.uuid().parse(r.id));
    await this.cloud.targets(
      {
        organizationId: context.organizationId,
        projectIds: before.resources
          .filter((r) => r.type === "stackit_resourcemanager_project")
          .map((r) => z.uuid().parse(r.id)),
        folderIds: currentFolders,
      },
      secret.key,
    );
    for (const folderId of currentFolders)
      await this.cloud.folderChildren(
        {
          organizationId: context.organizationId,
          folderId,
          projectIds: witness.projectIds,
        },
        secret.key,
      );
    return secret;
  }
  async review(session: Session, id: string) {
    return withTenant(this.pool, session, async (c) =>
      retirementExecutionReviewSchema.parse(
        (
          await c.query(
            "SELECT lzc_auth.retirement_execution_review($1,$2) AS value",
            [session.id, z.uuid().parse(id)],
          )
        ).rows[0].value,
      ),
    );
  }
  private async job(session: Session, id: string, jobId: string) {
    return withTenant(this.pool, session, async (c) =>
      jobSchema.parse(
        (
          await c.query(
            "SELECT * FROM lzc_auth.retirement_job_for_review($1,$2,$3)",
            [session.id, z.uuid().parse(id), z.uuid().parse(jobId)],
          )
        ).rows[0],
      ),
    );
  }
  async plan(session: Session, id: string, raw: unknown) {
    const request = retirementPlanRequestSchema.parse(raw);
    return this.start(
      session,
      await this.context(session, id, request.generation, request.scopeId),
    );
  }
  async apply(session: Session, id: string, jobId: string, raw: unknown) {
    const request = retirementApplyRequestSchema.parse(raw),
      saved = await this.job(session, id, jobId);
    if (
      saved.artifact_sha256 !== request.artifactSha256 ||
      !saved.runner_package_id ||
      !this.runner.supportsArtifact?.(saved.runner_package_id)
    )
      throw fail("retirement_artifact_changed");
    return this.start(
      session,
      await this.context(session, id, request.generation, saved.scope_id),
      saved,
    );
  }
  private async start(
    session: Session,
    context: z.infer<typeof contextSchema>,
    saved?: z.infer<typeof jobSchema>,
  ) {
    const { scope } = context;
    if (scope.stage === "complete") throw fail("retirement_changed");
    const opened = this.opened(session, context),
      secret = await this.credential(session, context);
    const { variables, revision, lock } = retirementSourceInputs(
      opened.source,
      Boolean(scope.instance_id),
      scope.stage,
    );
    if (!this.runner.supportsRetirement?.(revision, scope.stage))
      throw fail("retirement_source_unavailable");
    const id = randomUUID(),
      ticket = randomBytes(32).toString("base64url");
    const input = templateSchema.parse({
      id,
      operation: saved ? "apply" : "plan",
      retirementId: context.retirementId,
      generation: context.generation,
      scopeId: scope.id,
      phase: scope.stage,
      sourceRevision: revision,
      providerLockSha256: lock,
      variables,
      variablesSha256: retirementStateSha256(variables),
      baseline: opened.baseline,
      before: opened.before,
      beforeStateSha256: retirementStateSha256(opened.state),
      protectedServiceAccount: secret.key.credentials.iss,
      protectedProjectIds: [
        ...new Set([
          ...this.controlProjectIds,
          context.grant.cleanup_project_id,
        ]),
      ],
    });
    const binding = retirementStateSha256({
      ...input,
      id: undefined,
      operation: undefined,
      grantId: context.grant.id,
      stateVersion: scope.state_version,
    });
    const cipher = this.crypto.encrypt(
      Buffer.from(JSON.stringify(input)),
      session.tenantId,
      context.retirementId,
      `retirement-job:${id}:input`,
    );
    await withTenant(this.pool, session, (c) =>
      c.query(
        "SELECT lzc_auth.retirement_start_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
        [
          session.id,
          context.retirementId,
          context.generation,
          scope.id,
          id,
          tokenHash(ticket),
          scope.stage,
          revision,
          lock,
          input.variablesSha256,
          binding,
          cipher,
          scope.state_version,
          saved?.id ?? null,
          saved?.artifact_sha256 ?? null,
        ],
      ),
    );
    void this.runner
      .start(id, ticket, this.origin, async (app, pack) => {
        await withTenant(this.pool, session, (c) =>
          c.query("SELECT lzc_auth.retirement_record_dispatch($1,$2,$3,$4)", [
            session.id,
            id,
            app,
            pack,
          ]),
        );
      })
      .catch(async () => {
        await withTenant(this.pool, session, (c) =>
          c.query("SELECT lzc_auth.retirement_dispatch_failed($1)", [id]),
        );
      })
      .catch(() => {});
    return { id };
  }
  private async ticketIdentity(ticket: string, recovery = false) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw fail("invalid_runner_ticket", 401);
    const row = (
      await this.pool.query(
        "SELECT * FROM lzc_auth.resolve_retirement_ticket($1,$2)",
        [tokenHash(ticket), recovery],
      )
    ).rows[0];
    if (!row) throw fail("invalid_runner_ticket", 401);
    const identity = {
      tenantId: z.uuid().parse(row.tenant_id),
      userId: z.uuid().parse(row.operator_id),
    };
    return { identity, id: z.uuid().parse(row.id) };
  }
  private async resolve(ticket: string, recovery = false) {
    const { identity, id } = await this.ticketIdentity(ticket, recovery);
    const context = await withTenant(this.pool, identity, async (c) =>
      runnerContextSchema.parse(
        (
          await c.query(
            "SELECT lzc_auth.retirement_runner_context($1) AS value",
            [id],
          )
        ).rows[0].value,
      ),
    );
    return { identity, context };
  }
  async input(ticket: string) {
    const { identity, context } = await this.resolve(ticket),
      { job } = context;
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_claim_input($1)", [job.id]),
    );
    // Capability resolves the real approving operator and stored issuer session; it creates no user session or organization proof.
    const session: Session = {
      ...identity,
      id: job.issuer_session_id,
      githubId: "",
      login: "",
      csrfToken: "",
      expiresAt: job.expires_at,
    };
    const secret = await this.credential(session, {
      retirementId: job.retirement_id,
      generation: job.generation,
      organizationId: context.organizationId,
      notBefore: "",
      scope: context.scope,
      inventory: context.inventory,
      grant: context.grant,
    });
    const input = this.template(identity, job);
    if (
      input.beforeStateSha256 !== context.scope.current_state_sha256 ||
      !job.runner_package_id ||
      !this.runner.supportsArtifact?.(job.runner_package_id) ||
      !this.runner.supportsRetirement?.(job.source_revision, job.phase)
    )
      throw fail("retirement_state_changed");
    let plan: { data: string; sha256: string } | undefined;
    if (job.operation === "apply") {
      const saved = context.plan;
      if (
        !saved?.artifact_ciphertext ||
        !saved.artifact_sha256 ||
        saved.runner_package_id !== job.runner_package_id
      )
        throw fail("retirement_artifact_changed");
      const artifact = this.decrypt(
        identity,
        job.retirement_id,
        saved.artifact_ciphertext,
        `retirement-job:${saved.id}:artifact`,
      );
      if (sha(artifact) !== saved.artifact_sha256)
        throw fail("retirement_artifact_changed");
      plan = {
        data: artifact.toString("base64"),
        sha256: saved.artifact_sha256,
      };
    }
    return withTenant(this.pool, identity, async (c) => {
      await c.query("SELECT lzc_auth.retirement_assert_release($1)", [job.id]);
      return retirementWorkerInputSchema.parse({
        ...input,
        key: secret.key,
        backend: {
          address: `${this.origin}/api/retirement-runner/state`,
          lockAddress: `${this.origin}/api/retirement-runner/state/lock`,
          unlockAddress: `${this.origin}/api/retirement-runner/state/unlock`,
          username: "runner",
          password: ticket,
        },
        ...(plan ? { plan } : {}),
      });
    });
  }
  async stage(ticket: string, stage: string) {
    const { identity, context } = await this.resolve(ticket);
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_stage($1,$2)", [
        context.job.id,
        z
          .enum(["initializing", "validating", "planning", "applying"])
          .parse(stage),
      ]),
    );
  }
  async output(ticket: string, raw: unknown) {
    const { identity, id } = await this.ticketIdentity(ticket);
    const output = retirementOutputSchema.parse(raw);
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_store_output($1,$2,$3)", [
        id,
        output.text,
        output.truncated,
      ]),
    );
  }
  private async readJobOutput(session: Session, id: string, jobId: string) {
    const output = await withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query(
            "SELECT output_text AS text,output_truncated AS truncated,native_status,status,stopped_at FROM lzc_auth.retirement_job_for_review($1,$2,$3)",
            [session.id, z.uuid().parse(id), z.uuid().parse(jobId)],
          )
        ).rows[0],
    );
    return z
      .object({
        text: z.string(),
        truncated: z.boolean(),
        native_status: z.string().nullable(),
        status: z.string(),
        stopped_at: z.date().nullable(),
      })
      .parse(output);
  }
  async jobOutput(session: Session, id: string, jobId: string) {
    const output = await this.readJobOutput(session, id, jobId);
    return retirementOutputSchema.parse({
      text: output.text,
      truncated: output.truncated,
    });
  }
  async jobOutputStream(session: Session, id: string, jobId: string) {
    const output = await this.readJobOutput(session, id, jobId);
    const live =
      output.native_status === null &&
      output.stopped_at === null &&
      !["succeeded", "failed"].includes(output.status);
    return {
      ...retirementOutputSchema.parse({
        text: output.text,
        truncated: output.truncated,
      }),
      kind: live ? ("live" as const) : ("execution" as const),
    };
  }
  async artifact(ticket: string, raw: unknown) {
    const { identity, context } = await this.resolve(ticket),
      { job } = context;
    const request = z
      .strictObject({
        data: z.string(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        projection: z.unknown(),
        planSha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .parse(raw);
    const artifact = canonicalBase64(request.data, 16 * 1024 * 1024);
    if (sha(artifact) !== request.sha256 || !job.runner_package_id)
      throw fail("retirement_artifact_changed");
    const preview = await this.runner.preview?.({
      bytes: artifact,
      sha256: request.sha256,
      identity: job.runner_package_id,
    });
    const input = this.template(identity, job);
    assertRetirementProtectedResources(preview, input);
    const checked = verifyRetirementPlan(
        preview,
        input.before,
        input.baseline,
        input.phase,
      ),
      projection = retirementPlanProjection(preview);
    if (
      checked.planSha256 !== request.planSha256 ||
      retirementStateSha256(projection) !==
        retirementStateSha256(request.projection)
    )
      throw fail("retirement_artifact_changed");
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_save_artifact($1,$2,$3,$4,$5)", [
        job.id,
        this.crypto.encrypt(
          artifact,
          identity.tenantId,
          job.retirement_id,
          `retirement-job:${job.id}:artifact`,
        ),
        request.sha256,
        JSON.stringify(projection),
        request.planSha256,
      ]),
    );
  }
  async state(
    ticket: string,
    action: "read" | "write" | "lock" | "unlock",
    raw?: unknown,
    lock?: string,
  ) {
    const { identity, context } = await this.resolve(ticket),
      { job } = context;
    let ciphertext: Buffer | null = null,
      stateHash: string | null = null;
    if (action === "write") {
      const input = this.template(identity, job),
        after = retirementInventory(raw, { includePrivate: true });
      verifyRetirementState(after, input.before);
      if (job.operation !== "apply" || !context.plan?.projection)
        throw fail("retirement_state_changed");
      const checked = verifyRetirementPlan(
        context.plan.projection,
        input.before,
        input.baseline,
        input.phase,
      );
      verifyRetirementApply(input.before, after, checked.deletes, false);
      const old = retirementInventory(
        JSON.parse(
          this.decrypt(
            identity,
            job.retirement_id,
            context.scope.current_state_ciphertext,
            `retirement-state:${job.scope_id}`,
          ).toString("utf8"),
        ),
        { includePrivate: true },
      );
      verifyRetirementState(after, old);
      stateHash = retirementStateSha256(raw);
      if (
        after.serial <= old.serial &&
        stateHash !== context.scope.current_state_sha256
      )
        throw fail("retirement_state_changed");
      ciphertext = this.crypto.encrypt(
        Buffer.from(JSON.stringify(raw)),
        identity.tenantId,
        job.retirement_id,
        `retirement-state:${job.scope_id}`,
      );
    }
    const state = await withTenant(
      this.pool,
      identity,
      async (c) =>
        (
          await c.query(
            "SELECT lzc_auth.retirement_state_action($1,$2,$3,$4,$5,$6) AS value",
            [
              job.id,
              action,
              lock ?? null,
              ciphertext,
              stateHash,
              context.scope.current_state_sha256,
            ],
          )
        ).rows[0].value,
    );
    return action === "read"
      ? JSON.parse(
          this.decrypt(
            identity,
            job.retirement_id,
            bytes.parse(state),
            `retirement-state:${job.scope_id}`,
          ).toString("utf8"),
        )
      : null;
  }
  async result(ticket: string, raw: unknown) {
    const { identity, context } = await this.resolve(ticket, true),
      { job } = context,
      request = resultSchema.parse(raw);
    if (job.native_status !== null) {
      if (retirementStateSha256(job.result) === retirementStateSha256(request))
        return;
      throw fail("retirement_runner_transition_invalid");
    }
    if (job.operation === "apply" && request.stateSha256) {
      const input = this.template(identity, job),
        state = JSON.parse(
          this.decrypt(
            identity,
            job.retirement_id,
            context.scope.current_state_ciphertext,
            `retirement-state:${job.scope_id}`,
          ).toString("utf8"),
        );
      if (
        retirementStateSha256(state) !== request.stateSha256 ||
        !context.plan?.projection
      )
        throw fail("retirement_state_changed");
      const checked = verifyRetirementPlan(
          context.plan.projection,
          input.before,
          input.baseline,
          input.phase,
        ),
        receipt = verifyRetirementApply(
          input.before,
          retirementInventory(state, { includePrivate: true }),
          checked.deletes,
          request.status === "succeeded",
        );
      if (
        retirementStateSha256(receipt.removed) !==
          retirementStateSha256(request.removed) ||
        retirementStateSha256(receipt.removed.map((r) => r.address).sort()) !==
          retirementStateSha256([...(request.completedDeletes ?? [])].sort())
      )
        throw fail("retirement_apply_receipt_incomplete");
    } else if (job.operation === "apply" && request.status === "succeeded")
      throw fail("retirement_apply_receipt_incomplete");
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_store_result($1,$2,$3)", [
        job.id,
        request.status,
        JSON.stringify(request),
      ]),
    );
  }
  async recovery(ticket: string, raw: unknown) {
    const { identity, context } = await this.resolve(ticket, true),
      { job } = context,
      request = z
        .strictObject({
          data: z.string(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .parse(raw),
      state = canonicalBase64(request.data, 16 * 1024 * 1024);
    if (sha(state) !== request.sha256) throw fail("retirement_state_changed");
    const after = retirementInventory(JSON.parse(state.toString("utf8")), {
        includePrivate: true,
      }),
      input = this.template(identity, job);
    if (!context.plan?.projection) throw fail("retirement_artifact_changed");
    verifyRetirementApply(
      input.before,
      after,
      verifyRetirementPlan(
        context.plan.projection,
        input.before,
        input.baseline,
        input.phase,
      ).deletes,
      false,
    );
    if (job.recovery_ciphertext) {
      if (
        sha(
          this.decrypt(
            identity,
            job.retirement_id,
            job.recovery_ciphertext,
            `retirement-job:${job.id}:recovery`,
          ),
        ) !== request.sha256
      )
        throw fail("retirement_state_changed");
      return { accepted: true };
    }
    await withTenant(this.pool, identity, (c) =>
      c.query("SELECT lzc_auth.retirement_store_recovery($1,$2)", [
        job.id,
        this.crypto.encrypt(
          state,
          identity.tenantId,
          job.retirement_id,
          `retirement-job:${job.id}:recovery`,
        ),
      ]),
    );
    return { accepted: true };
  }
  async recoveryReview(session: Session, id: string, jobId: string) {
    const job = await this.job(session, id, jobId);
    if (!job.recovery_ciphertext)
      throw fail("retirement_reconciliation_required");
    const stateBytes = this.decrypt(
        session,
        id,
        job.recovery_ciphertext,
        `retirement-job:${job.id}:recovery`,
      ),
      state = JSON.parse(stateBytes.toString("utf8")),
      input = this.template(session, job);
    const inventory = retirementInventory(state, { includePrivate: true });
    verifyRetirementState(inventory, input.before);
    return {
      jobId: job.id,
      sha256: sha(stateBytes),
      lineage: inventory.lineage,
      serial: inventory.serial,
      removed: input.before.resources
        .filter(
          (r) =>
            !inventory.resources.some((after) => after.address === r.address),
        )
        .map(({ address, type, id }) => ({ address, type, id })),
      remainingCount: inventory.resources.length,
    };
  }
  async adoptRecovery(
    session: Session,
    id: string,
    jobId: string,
    raw: unknown,
  ) {
    const input = z
        .strictObject({
          generation: z.number().int().positive(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          confirmStoppedStateRecovery: z.literal(true),
          confirmFreshPlanRequired: z.literal(true),
        })
        .parse(raw),
      job = await this.job(session, id, jobId);
    const review = await this.review(session, id);
    if (review.generation !== input.generation)
      throw fail("retirement_changed");
    if (!job.recovery_ciphertext || !job.stopped_at)
      throw fail("retirement_reconciliation_required");
    const data = this.decrypt(
      session,
      id,
      job.recovery_ciphertext,
      `retirement-job:${job.id}:recovery`,
    );
    if (sha(data) !== input.sha256) throw fail("retirement_state_changed");
    const context = await withTenant(this.pool, session, async (c) =>
      runnerContextSchema.parse(
        (
          await c.query(
            "SELECT lzc_auth.retirement_runner_context($1) AS value",
            [job.id],
          )
        ).rows[0].value,
      ),
    );
    const template = this.template(session, job),
      state = JSON.parse(data.toString("utf8")),
      after = retirementInventory(state, { includePrivate: true });
    if (!context.plan?.projection) throw fail("retirement_artifact_changed");
    verifyRetirementApply(
      template.before,
      after,
      verifyRetirementPlan(
        context.plan.projection,
        template.before,
        template.baseline,
        template.phase,
      ).deletes,
      false,
    );
    const current = JSON.parse(
      this.decrypt(
        session,
        id,
        context.scope.current_state_ciphertext,
        `retirement-state:${job.scope_id}`,
      ).toString("utf8"),
    );
    verifyRetirementState(
      after,
      retirementInventory(current, { includePrivate: true }),
    );
    if (
      after.serial ===
        retirementInventory(current, { includePrivate: true }).serial &&
      retirementStateSha256(state) !== retirementStateSha256(current)
    )
      throw fail("retirement_state_changed");
    await withTenant(this.pool, session, (c) =>
      c.query(
        "SELECT lzc_auth.retirement_adopt_recovery($1,$2,$3,$4,$5,$6,$7)",
        [
          session.id,
          job.id,
          input.generation,
          context.scope.state_version,
          input.sha256,
          this.crypto.encrypt(
            data,
            session.tenantId,
            id,
            `retirement-state:${job.scope_id}`,
          ),
          retirementStateSha256(state),
        ],
      ),
    );
    return this.review(session, id);
  }
  async preview(session: Session, id: string, jobId: string) {
    const job = await this.job(session, id, jobId);
    if (!job.projection) throw fail("retirement_plan_unavailable");
    const input = this.template(session, job);
    return {
      id: job.id,
      phase: job.phase,
      artifactSha256: job.artifact_sha256,
      deletes: verifyRetirementPlan(
        job.projection,
        input.before,
        input.baseline,
        input.phase,
      ).deletes.map(({ address, type, id }) => ({ address, type, id })),
    };
  }
  async inspect(
    session: Session,
    id: string,
    jobId: string,
    generation: number,
  ) {
    const review = await this.review(session, id);
    if (review.generation !== generation) throw fail("retirement_changed");
    const job = await this.job(session, id, jobId);
    if (!job.runner_app_id || !job.runner_package_id)
      throw fail("retirement_runner_not_stopped");
    const result = job.result === null ? null : resultSchema.parse(job.result);
    if (result?.recoveryRequired && !job.recovery_ciphertext)
      throw fail("retirement_recovery_upload_pending");
    let stopped = await this.runner.isStopped?.(
      job.id,
      job.runner_app_id,
      job.runner_package_id,
    );
    if (!stopped && job.native_status && this.runner.stopReportedFailure) {
      await this.runner.stopReportedFailure(
        job.id,
        job.runner_app_id,
        job.runner_package_id,
      );
      stopped = await this.runner.isStopped?.(
        job.id,
        job.runner_app_id,
        job.runner_package_id,
      );
    }
    if (!stopped) throw fail("retirement_runner_not_stopped");
    await withTenant(this.pool, session, (c) =>
      c.query("SELECT lzc_auth.retirement_confirm_stopped($1,$2,$3,$4)", [
        session.id,
        job.id,
        job.runner_app_id,
        job.runner_package_id,
      ]),
    );
    if (!job.native_status) {
      await withTenant(this.pool, session, (c) =>
        c.query("SELECT lzc_auth.retirement_close_inert_job($1,$2)", [
          session.id,
          job.id,
        ]),
      );
      return this.review(session, id);
    }
    if (!result || !job.native_status || job.recovery_ciphertext)
      throw fail("retirement_reconciliation_required");
    let next: string | null = null,
      waiting = false;
    if (job.operation === "apply") {
      if (!result.stateSha256) throw fail("retirement_reconciliation_required");
      // Re-read authoritative State after the actual process has stopped, not only its callback.
      const context = await withTenant(this.pool, session, async (c) =>
        runnerContextSchema.parse(
          (
            await c.query(
              "SELECT lzc_auth.retirement_runner_context($1) AS value",
              [job.id],
            )
          ).rows[0].value,
        ),
      );
      const input = this.template(session, job),
        state = JSON.parse(
          this.decrypt(
            session,
            id,
            context.scope.current_state_ciphertext,
            `retirement-state:${job.scope_id}`,
          ).toString("utf8"),
        );
      if (
        retirementStateSha256(state) !== result.stateSha256 ||
        !context.plan?.projection
      )
        throw fail("retirement_reconciliation_required");
      const after = retirementInventory(state, { includePrivate: true });
      verifyRetirementApply(
        input.before,
        after,
        verifyRetirementPlan(
          context.plan.projection,
          input.before,
          input.baseline,
          input.phase,
        ).deletes,
        job.native_status === "succeeded",
      );
      if (job.native_status === "succeeded") {
        if (job.phase === "private_workloads") {
          if (retirementPrivateTargets(after).length)
            throw fail("retirement_reconciliation_required");
          next = "remove_projects";
        } else if (job.phase === "remove_projects") {
          if (
            after.resources.some(
              (r) => !r.address.startsWith("module.governance."),
            )
          )
            throw fail("retirement_reconciliation_required");
          next = "finalize_folders";
        } else if (job.phase === "remove_application") {
          if (after.resources.length)
            throw fail("retirement_reconciliation_required");
          next = "complete";
        } else {
          if (
            after.resources.some(
              (r) =>
                r.type === "stackit_resourcemanager_folder" ||
                r.type === "stackit_authorization_folder_role_assignment",
            )
          )
            throw fail("retirement_reconciliation_required");
          next = "complete";
        }
      } else
        waiting =
          job.phase === "finalize_folders" &&
          result.errorCode === "retirement_folder_purge_pending";
    }
    await withTenant(this.pool, session, (c) =>
      c.query("SELECT lzc_auth.retirement_close_job($1,$2,$3,$4)", [
        session.id,
        job.id,
        next,
        waiting,
      ]),
    );
    return this.review(session, id);
  }
}
