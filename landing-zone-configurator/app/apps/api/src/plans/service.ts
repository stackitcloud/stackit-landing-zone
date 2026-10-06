import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  planResultSchema,
  planStageSchema,
  platformApplySchema,
  runnerArtifactSchema,
} from "@lzc/contracts";
import {
  initialPlanIssues,
  platformContractSchema,
  readConfigurationRecord,
  readEditorDraft,
  recordOrganization,
  recordValues,
  saveEditorDraft,
  serializeTfvars,
} from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import { type Session, tokenHash } from "../auth/store.js";
import {
  CredentialError,
  type PostgresCredentialProfiles,
} from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import { stateDocument, stateForSource } from "../deployments/backends.js";
import {
  acceleratorCommit,
  type PreparationManifest,
} from "../deployments/preparations.js";
import type { Repositories } from "../github/repositories.js";
import { withTenant } from "../storage/database.js";
import type { PlanRunner } from "./cloud-foundry.js";
import { canonicalBase64 } from "./crypto.js";
import {
  canonicalJson,
  executionLive,
  manifestBinding,
  type PlatformExecution,
  providerLockHash,
  sha256,
} from "./execution.js";

const live = executionLive;
const lockHash = providerLockHash;
const invalid = (code: string, status = 409) =>
  new CredentialError(status, code);
export class Plans {
  constructor(
    private readonly pool: pg.Pool,
    private readonly profiles: Pick<
      PostgresCredentialProfiles,
      "verifyForPreparation"
    >,
    private readonly secrets: CredentialSecrets,
    private readonly repos: Pick<Repositories, "prepareSnapshot">,
    private readonly runner: PlanRunner,
    private readonly origin: string,
    private readonly execution?: PlatformExecution,
    private readonly repositoryToken?: (session: Session) => Promise<string>,
  ) {}
  async list(session: Session) {
    const rows = await withTenant(
      this.pool,
      session,
      async (client) =>
        (
          await client.query(
            'SELECT r.id,r.preparation_id AS "preparationId",r.status,r.summary,r.error_code AS "errorCode",r.created_at AS "createdAt",r.finished_at AS "finishedAt",r.operation,r.plan_id AS "planId",r.artifact_sha256 AS "artifactSha256",a.expires_at AS "expiresAt",b.descriptor AS "stateBackend" FROM lzc.plan_runs r LEFT JOIN lzc.plan_artifacts a ON a.run_id=r.id LEFT JOIN lzc.platform_states s ON s.state_key=r.state_key LEFT JOIN lzc.state_backends b ON b.id=s.backend_id ORDER BY r.created_at DESC LIMIT 100',
          )
        ).rows,
    );
    for (const row of rows) {
      row.applyAllowed = false;
      if (
        !this.execution ||
        row.operation !== "plan" ||
        row.status !== "succeeded" ||
        !row.artifactSha256
      )
        continue;
      try {
        const manifest = await this.preparation(session, row.preparationId);
        await this.verifySource(session, manifest);
        await this.verify(session, manifest);
        await withTenant(this.pool, session, async (client) => {
          const run = (
            await client.query("SELECT * FROM lzc.plan_runs WHERE id=$1", [
              row.id,
            ])
          ).rows[0];
          if (!run) throw invalid("plan_not_found", 404);
          await this.checkCurrent(client, session, manifest);
          const artifact = await this.execution!.approved(
            client,
            run,
            manifest,
            row.artifactSha256,
            session,
          );
          if (
            this.runner.supportsArtifact &&
            !this.runner.supportsArtifact(artifact.runner_droplet_id)
          )
            throw invalid("runner_package_changed");
          this.execution!.bytes(session, artifact);
        });
        row.applyAllowed = true;
      } catch {
        row.applyAllowed = false;
      }
    }
    return rows;
  }
  async checkpoint(session: Session, id: string) {
    z.uuid().parse(id);
    const execution = this.execution;
    if (!execution) throw invalid("checkpoint_unavailable", 503);
    return withTenant(this.pool, session, async (client) => {
      const roles = await client.query(
        "SELECT lzc.deployment_role() AS allowed",
      );
      if (!roles.rows[0]?.allowed)
        throw invalid("credential_role_required", 403);
      const run = (
        await client.query(
          "SELECT operation,status,state_key,error_code,input_claimed,finished_at FROM lzc.plan_runs WHERE id=$1 AND owner_user_id=$2 FOR SHARE",
          [id, session.userId],
        )
      ).rows[0];
      if (!run) throw invalid("plan_not_found", 404);
      if (run.operation !== "apply" || run.status !== "recovery_required")
        throw invalid("checkpoint_not_available");
      const state = (
        await client.query(
          "SELECT state_key,version,ciphertext,stable_aad,backend_id,lock_run_id,pending_backend_id FROM lzc.platform_states WHERE state_key=$1 FOR SHARE",
          [run.state_key],
        )
      ).rows[0];
      if (!state || state.backend_id || !state.ciphertext)
        throw invalid("checkpoint_not_available");
      const bytes = execution.bootstrap(session, state);
      const document = stateDocument(bytes);
      const resources = new Map<
        string,
        {
          mode: string;
          type: string;
          instances: number;
          deposedInstances: number;
        }
      >();
      for (const resource of document.resources) {
        const { mode, type, instances } = resource;
        if (
          (mode !== "managed" && mode !== "data") ||
          typeof type !== "string" ||
          !/^[a-z][a-z0-9_]{0,127}$/.test(type) ||
          !instances
        )
          throw invalid("checkpoint_invalid");
        const key = `${mode}:${type}`;
        const summary = resources.get(key) ?? {
          mode,
          type,
          instances: 0,
          deposedInstances: 0,
        };
        summary.instances += instances.length;
        summary.deposedInstances += instances.filter(
          (instance) => instance.deposed,
        ).length;
        resources.set(key, summary);
        if (resources.size > 1024) throw invalid("checkpoint_invalid");
      }
      const recovery = await client.query(
        "SELECT EXISTS(SELECT 1 FROM lzc.state_recoveries WHERE run_id=$1) AS available",
        [id],
      );
      const migration =
        run.error_code === "state_failed" &&
        run.input_claimed === true &&
        run.finished_at &&
        state.pending_backend_id &&
        !state.lock_run_id &&
        recovery.rows[0]?.available === false
          ? await execution.inspectMigration(
              client,
              session,
              state.state_key,
              id,
            )
          : undefined;
      return {
        ...(migration ? { migration } : {}),
        stateVersion: String(state.version),
        checkpointSha256: sha256(bytes),
        serial: document.serial,
        lockHeld: Boolean(state.lock_run_id),
        pendingMigration: Boolean(state.pending_backend_id),
        recoveryAvailable: recovery.rows[0]?.available === true,
        canResume:
          run.error_code === "apply_failed" &&
          run.input_claimed === true &&
          Boolean(run.finished_at) &&
          BigInt(state.version) > 0n &&
          !state.lock_run_id &&
          !state.pending_backend_id &&
          recovery.rows[0]?.available === false,
        resources: [...resources.values()].sort((left, right) =>
          `${left.mode}:${left.type}`.localeCompare(
            `${right.mode}:${right.type}`,
          ),
        ),
      };
    });
  }
  async reconcile(session: Session, id: string, raw: unknown) {
    z.uuid().parse(id);
    const input = z
      .union([
        z.strictObject({
          confirmRetainState: z.literal(true),
          stateVersion: z.string().regex(/^[1-9][0-9]*$/),
          checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
        z.strictObject({
          confirmCompleteMigration: z.literal(true),
          stateVersion: z.string().regex(/^[1-9][0-9]*$/),
          checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
          remoteIdentity: z.string().min(1).max(512),
        }),
      ])
      .parse(raw);
    const execution = this.execution;
    if (!execution) throw invalid("checkpoint_unavailable", 503);
    const completingMigration = "confirmCompleteMigration" in input;
    return withTenant(this.pool, session, async (client) => {
      const roles = await client.query(
        "SELECT lzc.deployment_role() AS allowed",
      );
      if (!roles.rows[0]?.allowed)
        throw invalid("credential_role_required", 403);
      const run = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 AND owner_user_id=$2 FOR UPDATE",
          [id, session.userId],
        )
      ).rows[0];
      if (!run) throw invalid("plan_not_found", 404);
      const receipt = (
        await client.query(
          "SELECT state_version,checkpoint_sha256 FROM lzc.platform_reconciliations WHERE run_id=$1",
          [id],
        )
      ).rows[0];
      if (receipt) {
        if (
          run.operation !== "apply" ||
          run.status !== (completingMigration ? "succeeded" : "failed")
        )
          throw invalid("reconciliation_not_available");
        if (
          String(receipt.state_version) !== input.stateVersion ||
          receipt.checkpoint_sha256 !== input.checkpointSha256
        )
          throw invalid("checkpoint_changed");
        if (
          "confirmCompleteMigration" in input &&
          run.applied_state_version === null
        ) {
          const state = (
            await client.query(
              "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
              [run.state_key],
            )
          ).rows[0];
          if (
            !state ||
            state.lock_run_id ||
            state.ciphertext !== null ||
            !state.backend_id ||
            state.backend_id !== state.pending_backend_id ||
            state.migration_run_id !== id ||
            String(state.migration_version) !== String(receipt.state_version) ||
            String(state.version) !==
              (BigInt(receipt.state_version) + 1n).toString() ||
            !state.migration_sha256 ||
            state.remote_identity !== input.remoteIdentity ||
            state.owner_user_id !== session.userId ||
            !run.input_claimed ||
            !run.finished_at
          )
            throw invalid("checkpoint_changed");
          await execution.current(client, session, state);
          await client.query(
            "UPDATE lzc.plan_runs SET applied_state_version=$2 WHERE id=$1 AND applied_state_version IS NULL",
            [id, state.version],
          );
        }
        return { id, reconciled: true };
      }
      if (
        run.operation !== "apply" ||
        run.status !== "recovery_required" ||
        run.error_code !==
          (completingMigration ? "state_failed" : "apply_failed") ||
        !run.input_claimed ||
        !run.finished_at
      )
        throw invalid("reconciliation_not_available");
      const state = (
        await client.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
          [run.state_key],
        )
      ).rows[0];
      const recoveries = await client.query(
        "SELECT run_id FROM lzc.state_recoveries WHERE run_id=$1",
        [id],
      );
      if (
        !state ||
        state.backend_id ||
        state.lock_run_id ||
        (!completingMigration && state.pending_backend_id) ||
        !state.ciphertext ||
        recoveries.rowCount
      )
        throw invalid("reconciliation_not_available");
      const bytes = execution.bootstrap(session, state);
      stateDocument(bytes);
      if (
        String(state.version) !== input.stateVersion ||
        sha256(bytes) !== input.checkpointSha256
      )
        throw invalid("checkpoint_changed");
      if ("confirmCompleteMigration" in input) {
        const preparation = (
          await client.query(
            "SELECT manifest FROM lzc.deployment_preparations WHERE id=$1",
            [run.preparation_id],
          )
        ).rows[0];
        if (!preparation) throw invalid("input_invalid");
        await execution.migration(
          client,
          session,
          run,
          "complete",
          preparation.manifest.organization.id,
          input,
        );
      }
      await client.query(
        "INSERT INTO lzc.platform_reconciliations(run_id,tenant_id,owner_user_id,session_id,state_key,state_version,checkpoint_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          session.tenantId,
          session.userId,
          session.id,
          state.state_key,
          state.version,
          input.checkpointSha256,
        ],
      );
      await client.query(
        "UPDATE lzc.plan_runs SET status=$2,error_code=CASE WHEN $2='succeeded' THEN NULL ELSE error_code END,applied_state_version=CASE WHEN $2='succeeded' THEN (SELECT version FROM lzc.platform_states WHERE state_key=lzc.plan_runs.state_key) ELSE applied_state_version END WHERE id=$1",
        [id, completingMigration ? "succeeded" : "failed"],
      );
      return { id, reconciled: true };
    });
  }
  async output(session: Session, id: string) {
    z.uuid().parse(id);
    const input = await withTenant(this.pool, session, async (client) => {
      const roles = await client.query(
        "SELECT lzc.deployment_role() AS allowed",
      );
      if (!roles.rows[0]?.allowed)
        throw invalid("credential_role_required", 403);
      const run = (
        await client.query(
          "SELECT runner_app_id,status,operation,artifact_sha256,output_ciphertext,output_truncated FROM lzc.plan_runs WHERE id=$1 AND owner_user_id=$2",
          [id, session.userId],
        )
      ).rows[0];
      if (!run) throw invalid("plan_not_found", 404);
      if (
        run.output_ciphertext &&
        ![
          "starting",
          "initializing",
          "validating",
          "planning",
          "applying",
        ].includes(run.status)
      ) {
        if (!this.execution) throw invalid("plan_output_unavailable", 503);
        const bytes = this.execution.crypto.decrypt(
          run.output_ciphertext,
          session.tenantId,
          session.userId,
          `output:${id}`,
        );
        try {
          return {
            appId: run.runner_app_id as string | null,
            recorded: {
              text: bytes.toString("utf8"),
              truncated: Boolean(run.output_truncated),
              kind: "execution" as const,
            },
          };
        } finally {
          bytes.fill(0);
        }
      }
      if (run.status !== "succeeded" || run.operation !== "plan")
        return { appId: run.runner_app_id as string | null };
      if (!this.execution) throw invalid("plan_output_unavailable", 503);
      const artifact = (
        await client.query("SELECT * FROM lzc.plan_artifacts WHERE run_id=$1", [
          id,
        ])
      ).rows[0];
      if (!artifact || artifact.sha256 !== run.artifact_sha256)
        throw invalid("plan_output_unavailable", 404);
      return {
        appId: run.runner_app_id as string | null,
        saved: {
          bytes: this.execution.bytes(session, artifact),
          sha256: artifact.sha256 as string,
          identity: artifact.runner_droplet_id as string,
        },
      };
    });
    if (input.recorded) return input.recorded;
    if (!this.runner.output) throw invalid("plan_output_unavailable", 503);
    try {
      return await this.runner.output(id, input.appId, input.saved);
    } catch {
      throw invalid("plan_output_unavailable", 503);
    } finally {
      input.saved?.bytes.fill(0);
    }
  }

  async recordOutput(ticket: string, raw: unknown) {
    const { session, id } = await this.resolve(ticket);
    const output = z
      .strictObject({
        text: z.string().max(2 * 1024 * 1024),
        truncated: z.boolean(),
      })
      .parse(raw);
    if (!this.execution || Buffer.byteLength(output.text) > 2 * 1024 * 1024)
      throw invalid("plan_output_unavailable", 503);
    const ciphertext = this.execution.crypto.encrypt(
      Buffer.from(output.text),
      session.tenantId,
      session.userId,
      `output:${id}`,
    );
    await withTenant(this.pool, session, async (client) => {
      const updated = await client.query(
        `UPDATE lzc.plan_runs SET output_ciphertext=$2,output_truncated=$3 WHERE id=$1 AND status IN ${live} AND input_claimed AND expires_at>now() AND output_ciphertext IS NULL`,
        [id, ciphertext, output.truncated],
      );
      if (!updated.rowCount) throw invalid("invalid_runner_transition");
    });
  }

  private async preparation(session: Session, id: string) {
    return withTenant(this.pool, session, async (c) => {
      const roles = await c.query("SELECT lzc.deployment_role() AS allowed");
      if (!roles.rows[0]?.allowed)
        throw invalid("credential_role_required", 403);
      const row = (
        await c.query(
          "SELECT manifest,credential_id FROM lzc.deployment_preparations WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!row?.credential_id) throw invalid("credential_not_found", 404);
      const manifest = row.manifest as PreparationManifest;
      if (
        manifest.accelerator.commit !== acceleratorCommit ||
        manifest.credential.id !== row.credential_id
      )
        throw invalid("input_invalid");
      const configuration = readConfigurationRecord(manifest.configuration);
      if (recordOrganization(configuration) !== manifest.organization.id)
        throw invalid("input_invalid");
      if (initialPlanIssues(configuration).length)
        throw invalid("configuration_execution_not_supported");
      return { ...manifest, configuration };
    });
  }
  private async verify(session: Session, manifest: PreparationManifest) {
    const checked = await this.profiles.verifyForPreparation(
      session,
      manifest.credential.id,
      manifest.organization.id,
    );
    if (
      checked.check.status !== "passed" ||
      checked.check.organizationId !== manifest.organization.id
    )
      throw invalid("access_check_failed", 422);
    if (
      checked.version !== manifest.credential.secretVersion ||
      checked.keyId !== manifest.credential.keyId
    )
      throw invalid("credential_changed");
  }
  private async verifyDatabaseSource(
    session: Session,
    manifest: PreparationManifest,
  ) {
    if ("repository" in manifest.source) return;
    const source = manifest.source;
    await withTenant(this.pool, session, async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM lzc_auth.read_execution_configuration($1)",
          [source.configurationId],
        )
      ).rows[0];
      if (!row) throw invalid("configuration_not_found", 404);
      if (row.revision !== source.revision)
        throw invalid("configuration_changed");
      const document = saveEditorDraft(
        source.configurationId,
        readEditorDraft(row.document),
      );
      const hash = createHash("sha256")
        .update(JSON.stringify(document))
        .digest("hex");
      if (hash !== source.documentSha256) throw invalid("input_invalid");
    });
  }
  private async verifySource(
    session: Session,
    manifest: PreparationManifest,
    token?: string | (() => Promise<string>),
  ) {
    if (!("repository" in manifest.source))
      return this.verifyDatabaseSource(session, manifest);
    const access =
      token === undefined
        ? await this.repositoryToken?.(session)
        : typeof token === "string"
          ? token
          : await token();
    if (!access) throw invalid("github_connection_required", 401);
    const snapshot = await this.repos.prepareSnapshot(
      access,
      manifest.source.repository,
      manifest.source.configurationId,
      manifest.source.commit,
    );
    if (
      snapshot.head !== manifest.source.commit ||
      snapshot.document.id !== manifest.source.configurationId ||
      sha256(snapshot.tfvars) !== manifest.tfvarsSha256 ||
      canonicalJson(snapshot.document) !== canonicalJson(manifest.configuration)
    )
      throw invalid("configuration_changed");
  }
  private async checkCurrent(
    client: pg.PoolClient,
    session: Session,
    manifest: PreparationManifest,
  ) {
    const credential = (
      await client.query(
        "SELECT key_id FROM lzc.credential_profiles WHERE id=$1 AND state='stored' FOR SHARE",
        [manifest.credential.id],
      )
    ).rows[0];
    if (credential?.key_id !== manifest.credential.keyId)
      throw invalid("credential_changed");
    const role = await client.query("SELECT lzc.deployment_role() AS allowed");
    if (!role.rows[0]?.allowed) throw invalid("credential_role_required", 403);
    if (!("repository" in manifest.source)) {
      const source = manifest.source;
      const row = (
        await client.query(
          "SELECT * FROM lzc_auth.read_execution_configuration($1)",
          [source.configurationId],
        )
      ).rows[0];
      if (!row || row.revision !== source.revision)
        throw invalid("configuration_changed");
      const document = saveEditorDraft(
        source.configurationId,
        readEditorDraft(row.document),
      );
      if (
        sha256(JSON.stringify(document)) !== source.documentSha256 ||
        canonicalJson(document) !== canonicalJson(manifest.configuration)
      )
        throw invalid("configuration_changed");
    }
    if (
      sha256(serializeTfvars(recordValues(manifest.configuration))) !==
      manifest.tfvarsSha256
    )
      throw invalid("input_invalid");
  }
  private async requireEmptyInitialState(
    client: pg.PoolClient,
    session: Session,
    manifest: PreparationManifest,
  ) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`state-source:${session.tenantId}:${manifest.source.configurationId}`],
    );
    const legacy = await client.query(
      "SELECT lzc_auth.has_legacy_state($1) AS present",
      [manifest.source.configurationId],
    );
    if (legacy.rows[0]?.present)
      throw invalid("legacy_state_migration_required");
    if (
      manifest.backend ||
      (await stateForSource(client, manifest.source.configurationId))
    )
      throw invalid("initial_plan_requires_empty_state");
  }

  async start(
    session: Session,
    token: string | (() => Promise<string>),
    preparationId: string,
  ) {
    const manifest = await this.preparation(session, preparationId);
    await this.verifySource(session, manifest, token);
    await this.verify(session, manifest);
    const id = randomUUID(),
      ticket = randomBytes(32).toString("base64url");
    await withTenant(this.pool, session, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `plans:${session.userId}`,
      ]);
      const active = await c.query(
        `SELECT id FROM lzc.plan_runs WHERE status IN ${live} OR status='recovery_required'`,
      );
      if (active.rowCount) throw invalid("plan_already_running");
      const recent = await c.query(
        "SELECT count(*)::int AS count FROM lzc.plan_runs WHERE created_at>now()-interval '1 day'",
      );
      if (recent.rows[0].count >= 20) throw invalid("plan_daily_limit");
      if (!this.execution)
        await this.requireEmptyInitialState(c, session, manifest);
      const state = this.execution
        ? await this.execution.capture(c, session, manifest)
        : undefined;
      if (this.execution) await this.checkCurrent(c, session, manifest);
      await c.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,state_key,state_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          session.tenantId,
          session.userId,
          preparationId,
          tokenHash(ticket),
          this.execution ? "platform-plan" : "initial-plan-only",
          state?.key ?? null,
          state?.version ?? null,
        ],
      );
      await this.issueCredentialGrant(c, session, id, manifest);
    });
    this.dispatch(session, id, ticket);
    return { id };
  }
  private async issueCredentialGrant(
    client: pg.PoolClient,
    session: Session,
    runId: string,
    manifest: PreparationManifest,
  ) {
    await client.query(
      "INSERT INTO lzc.plan_credential_grants(run_id,tenant_id,owner_user_id,preparation_id,organization_id,credential_profile_id,credential_version,credential_key_id,binding_sha256,operation,expires_at) SELECT run.id,run.tenant_id,run.owner_user_id,run.preparation_id,$2,$3,$4,$5,$6,run.operation,least(run.expires_at,$7) FROM lzc.plan_runs run JOIN lzc.deployment_preparations preparation ON preparation.id=run.preparation_id WHERE run.id=$1",
      [
        runId,
        manifest.organization.id,
        manifest.credential.id,
        manifest.credential.secretVersion,
        manifest.credential.keyId,
        manifestBinding(manifest),
        session.expiresAt,
      ],
    );
  }
  private dispatch(session: Session, id: string, ticket: string) {
    void this.runner
      .start(id, ticket, this.origin, async (appId, sourceDropletId) => {
        await withTenant(this.pool, session, async (c) => {
          const run = (
            await c.query(
              "SELECT operation,plan_id FROM lzc.plan_runs WHERE id=$1",
              [id],
            )
          ).rows[0];
          if (run?.operation === "apply") {
            const artifact = (
              await c.query(
                "SELECT runner_droplet_id FROM lzc.plan_artifacts WHERE run_id=$1 AND expires_at>now()",
                [run.plan_id],
              )
            ).rows[0];
            if (!artifact || artifact.runner_droplet_id !== sourceDropletId)
              throw invalid("artifact_invalid");
          }
          const row = await c.query(
            `UPDATE lzc.plan_runs SET runner_app_id=$2,runner_droplet_id=$3 WHERE id=$1 AND runner_app_id IS NULL AND status IN ${live} AND expires_at>now()`,
            [id, appId, sourceDropletId],
          );
          if (!row.rowCount) throw invalid("runner_unavailable");
        });
      })
      .catch(async () => {
        await withTenant(this.pool, session, async (c) => {
          await c.query(
            `UPDATE lzc.plan_runs SET status=CASE WHEN operation='apply' THEN 'recovery_required' ELSE 'failed' END,error_code='runner_unavailable',finished_at=now() WHERE id=$1 AND status IN ${live}`,
            [id],
          );
        });
      })
      .catch(() => {});
  }
  async apply(
    session: Session,
    token: () => Promise<string>,
    planId: string,
    raw: unknown,
  ) {
    if (!this.execution) throw invalid("execution_disabled", 503);
    const request = platformApplySchema.parse(raw);
    const plan = await withTenant(
      this.pool,
      session,
      async (client) =>
        (
          await client.query(
            "SELECT * FROM lzc.plan_runs WHERE id=$1 AND operation='plan'",
            [z.uuid().parse(planId)],
          )
        ).rows[0],
    );
    if (!plan) throw invalid("plan_not_found", 404);
    const manifest = await this.preparation(session, plan.preparation_id);
    if (request.organizationId !== manifest.organization.id)
      throw invalid("organization_mismatch", 403);
    await this.verifySource(session, manifest, token);
    await this.verify(session, manifest);
    const id = randomUUID(),
      ticket = randomBytes(32).toString("base64url");
    await withTenant(this.pool, session, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`plans:${session.userId}`],
      );
      const current = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 FOR UPDATE",
          [plan.id],
        )
      ).rows[0];
      if (!current) throw invalid("plan_not_found", 404);
      await this.checkCurrent(client, session, manifest);
      const artifact = await this.execution!.approved(
        client,
        current,
        manifest,
        request.artifactSha256,
        session,
      );
      if (
        this.runner.supportsArtifact &&
        !this.runner.supportsArtifact(artifact.runner_droplet_id)
      )
        throw invalid("runner_package_changed");
      this.execution!.bytes(session, artifact);
      const active = await client.query(
        `SELECT id FROM lzc.plan_runs WHERE status IN ${live} OR status='recovery_required'`,
      );
      if (active.rowCount) throw invalid("plan_already_running");
      await client.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,operation,plan_id,artifact_sha256,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-apply','apply',$6,$7,$8,$9)",
        [
          id,
          session.tenantId,
          session.userId,
          current.preparation_id,
          tokenHash(ticket),
          current.id,
          request.artifactSha256,
          current.state_key,
          current.state_version,
        ],
      );
      await this.issueCredentialGrant(client, session, id, manifest);
    });
    this.dispatch(session, id, ticket);
    return { id };
  }
  private async resolve(ticket: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw invalid("invalid_runner_ticket", 401);
    const row = (
      await this.pool.query("SELECT * FROM lzc_auth.resolve_plan_ticket($1)", [
        tokenHash(ticket),
      ])
    ).rows[0];
    if (!row) throw invalid("invalid_runner_ticket", 401);
    // Internal job identity, authorized by the one-job capability; never a browser session.
    const session: Session = {
      id: row.id,
      userId: row.owner_user_id,
      tenantId: row.tenant_id,
      githubId: "",
      login: "",
      csrfToken: "",
      expiresAt: new Date(),
    };
    return { session, id: row.id as string };
  }
  async input(ticket: string) {
    const { session, id } = await this.resolve(ticket);
    const run = await withTenant(this.pool, session, async (c) => {
      const row = (
        await c.query(
          `UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1 AND NOT input_claimed AND status='starting' AND expires_at>now() RETURNING *`,
          [id],
        )
      ).rows[0];
      if (!row) throw invalid("invalid_runner_ticket", 401);
      return row;
    });
    const manifest = await this.preparation(session, run.preparation_id);
    await withTenant(this.pool, session, async (client) => {
      const grant = await client.query(
        "UPDATE lzc.plan_credential_grants SET consumed_at=now() WHERE run_id=$1 AND preparation_id=$2 AND organization_id=$3 AND credential_profile_id=$4 AND credential_version=$5 AND credential_key_id=$6 AND binding_sha256=$7 AND operation=$8 AND expires_at>now() AND revoked_at IS NULL AND consumed_at IS NULL RETURNING run_id",
        [
          id,
          run.preparation_id,
          manifest.organization.id,
          manifest.credential.id,
          manifest.credential.secretVersion,
          manifest.credential.keyId,
          manifestBinding(manifest),
          run.operation,
        ],
      );
      if (grant.rowCount !== 1)
        throw invalid("credential_grant_unavailable", 403);
    });
    if (this.execution) await this.verifySource(session, manifest);
    else await this.verifyDatabaseSource(session, manifest);
    await this.verify(session, manifest);
    const secret = await this.secrets.get(session, manifest.credential.id);
    if (
      secret.version !== manifest.credential.secretVersion ||
      secret.key.credentials.kid !== manifest.credential.keyId
    )
      throw invalid("credential_changed");
    const tfvars = serializeTfvars(recordValues(manifest.configuration));
    if (
      createHash("sha256").update(tfvars).digest("hex") !==
      manifest.tfvarsSha256
    )
      throw invalid("input_invalid");
    const artifact = await withTenant(this.pool, session, async (c) => {
      const valid = await c.query(
        `SELECT r.* FROM lzc.plan_runs r WHERE r.id=$1 AND r.status='initializing' AND r.expires_at>now() AND lzc.deployment_role()`,
        [id],
      );
      if (!valid.rowCount) throw invalid("invalid_runner_ticket", 401);
      if (!this.execution) {
        if (run.mode !== "initial-plan-only")
          throw invalid("execution_disabled");
        await this.requireEmptyInitialState(c, session, manifest);
        return undefined;
      }
      if (!valid.rows[0].runner_droplet_id) throw invalid("artifact_invalid");
      await this.checkCurrent(c, session, manifest);
      const state = (
        await c.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
          [run.state_key],
        )
      ).rows[0];
      if (
        !state ||
        state.lock_run_id ||
        String(state.version) !== String(run.state_version)
      )
        throw invalid("state_changed");
      await this.execution.current(c, session, state);
      if (run.operation === "apply") {
        const saved = (
          await c.query(
            "SELECT * FROM lzc.plan_artifacts WHERE run_id=$1 AND sha256=$2 AND expires_at>now()",
            [run.plan_id, run.artifact_sha256],
          )
        ).rows[0];
        if (
          !saved ||
          saved.binding_sha256 !== manifestBinding(manifest) ||
          saved.state_key !== run.state_key ||
          String(saved.state_version) !== String(run.state_version) ||
          saved.engine_version !== run.engine_version ||
          saved.provider_lock_sha256 !== run.provider_lock_sha256 ||
          saved.runner_droplet_id !== valid.rows[0].runner_droplet_id
        )
          throw invalid("artifact_invalid");
        return {
          data: this.execution.bytes(session, saved).toString("base64"),
          sha256: saved.sha256,
        };
      }
      return undefined;
    });
    let runnerKey = secret.key;
    const backend = this.execution
      ? await withTenant(this.pool, session, async (client) => {
          const state = (
            await client.query(
              "SELECT * FROM lzc.platform_states WHERE state_key=$1",
              [run.state_key],
            )
          ).rows[0];
          if (!state) throw invalid("state_failed");
          runnerKey = this.execution!.runnerKey(session, state) ?? secret.key;
          if (state.backend_id) {
            if (!this.execution!.backends)
              throw invalid("backend_service_unavailable", 503);
            return this.execution!.backends.runner(
              client,
              session,
              state.backend_id,
            );
          }
          return {
            kind: "bootstrap" as const,
            address: `${this.origin}/api/runner/state`,
            lockAddress: `${this.origin}/api/runner/state/lock`,
            unlockAddress: `${this.origin}/api/runner/state/unlock`,
            username: "runner",
            password: ticket,
          };
        })
      : undefined;
    await withTenant(this.pool, session, async (client) => {
      const grant = await client.query(
        "SELECT credential_grant.run_id FROM lzc.plan_credential_grants credential_grant JOIN lzc.plan_runs run ON run.id=credential_grant.run_id WHERE credential_grant.run_id=$1 AND credential_grant.consumed_at IS NOT NULL AND credential_grant.revoked_at IS NULL AND credential_grant.expires_at>now() AND run.input_claimed AND run.status='initializing' AND run.expires_at>now()",
        [id],
      );
      if (grant.rowCount !== 1)
        throw invalid("credential_grant_unavailable", 403);
    });
    return {
      id,
      mode: run.mode,
      acceleratorCommit,
      lockHash,
      tfvars,
      tfvarsSha256: manifest.tfvarsSha256,
      key: runnerKey,
      ...(backend ? { backend } : {}),
      ...(artifact ? { plan: artifact } : {}),
    };
  }
  async stage(ticket: string, raw: unknown) {
    const { session, id } = await this.resolve(ticket);
    const stage = planStageSchema.parse(raw);
    const previous = {
      initializing: "initializing",
      validating: "initializing",
      planning: "validating",
      applying: "validating",
    }[stage];
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        "UPDATE lzc.plan_runs SET status=$2 WHERE id=$1 AND status=$3 AND input_claimed AND expires_at>now() AND (($2='planning' AND operation='plan') OR ($2='applying' AND operation='apply') OR $2 IN ('initializing','validating'))",
        [id, stage, previous],
      );
      if (!row.rowCount) throw invalid("invalid_runner_transition");
    });
  }
  async result(ticket: string, raw: unknown) {
    const { session, id } = await this.resolve(ticket);
    const result = planResultSchema.parse(raw);
    await withTenant(this.pool, session, async (c) => {
      const run = (
        await c.query("SELECT * FROM lzc.plan_runs WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      if (!run) throw invalid("invalid_runner_transition");
      let summary: unknown = null;
      let outcome: string = result.status;
      let appliedStateVersion: string | null = null;
      if (run.operation === "apply") {
        if (
          result.status === "succeeded" &&
          (result.summary || result.artifactSha256)
        )
          throw invalid("invalid_runner_transition");
        const state = (
          await c.query(
            "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
            [run.state_key],
          )
        ).rows[0];
        if (
          result.status === "succeeded" &&
          (!state || state.lock_run_id || !state.backend_id)
        )
          throw invalid("state_failed");
        if (result.status === "succeeded") {
          const current = await this.execution!.current(
            c,
            session,
            state,
            true,
          );
          appliedStateVersion = String(current.version);
        }
        if (result.status === "failed") outcome = "recovery_required";
      } else if (result.status === "succeeded") {
        if (!result.summary) throw invalid("invalid_runner_transition");
        summary = result.summary;
        if (run.mode === "platform-plan") {
          const artifact = (
            await c.query(
              "SELECT sha256,summary FROM lzc.plan_artifacts WHERE run_id=$1 AND expires_at>now()",
              [id],
            )
          ).rows[0];
          if (
            !artifact ||
            artifact.sha256 !== result.artifactSha256 ||
            canonicalJson(artifact.summary) !== canonicalJson(result.summary)
          )
            throw invalid("artifact_invalid");
          summary = artifact.summary;
        } else if (result.artifactSha256) throw invalid("artifact_invalid");
      }
      const row = await c.query(
        `UPDATE lzc.plan_runs SET status=$2,summary=$3,error_code=$4,artifact_sha256=COALESCE($5,artifact_sha256),applied_state_version=$6,finished_at=now() WHERE id=$1 AND status IN ${result.status === "succeeded" ? (run.operation === "apply" ? "('applying')" : "('planning')") : live} AND expires_at>now()`,
        [
          id,
          outcome,
          summary === null ? null : JSON.stringify(summary),
          result.status === "failed" ? result.errorCode : null,
          result.status === "succeeded"
            ? (result.artifactSha256 ?? null)
            : null,
          appliedStateVersion,
        ],
      );
      if (!row.rowCount) throw invalid("invalid_runner_transition");
    });
  }
  async cancel(session: Session, id: string) {
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        `UPDATE lzc.plan_runs SET status='cancelled',error_code='cancelled',finished_at=now() WHERE id=$1 AND operation='plan' AND status IN ${live}`,
        [z.uuid().parse(id)],
      );
      if (!row.rowCount) throw invalid("plan_not_active", 404);
      await c.query(
        "UPDATE lzc.plan_credential_grants SET revoked_at=coalesce(revoked_at,now()) WHERE run_id=$1 AND consumed_at IS NULL",
        [id],
      );
    });
  }
  async revokeCredentialGrant(session: Session, id: string, input: unknown) {
    z.strictObject({ confirmCredentialGrantRevocation: z.literal(true) }).parse(
      input,
    );
    return withTenant(this.pool, session, async (client) => {
      const grant = (
        await client.query(
          "SELECT * FROM lzc.plan_credential_grants WHERE run_id=$1 FOR UPDATE",
          [z.uuid().parse(id)],
        )
      ).rows[0];
      if (!grant) throw invalid("credential_grant_not_found", 404);
      if (grant.consumed_at)
        throw invalid("credential_grant_already_consumed", 409);
      const revoked = (
        await client.query(
          "UPDATE lzc.plan_credential_grants SET revoked_at=coalesce(revoked_at,now()) WHERE run_id=$1 RETURNING revoked_at",
          [id],
        )
      ).rows[0];
      return {
        runId: id,
        revokedAt: revoked.revoked_at.toISOString() as string,
      };
    });
  }
  async artifact(ticket: string, raw: unknown) {
    if (!this.execution) throw invalid("execution_disabled", 503);
    const { session, id } = await this.resolve(ticket);
    const request = runnerArtifactSchema.parse(raw);
    return withTenant(this.pool, session, async (client) => {
      const run = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 AND expires_at>now() FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!run) throw invalid("invalid_runner_transition");
      const preparation = (
        await client.query(
          "SELECT manifest FROM lzc.deployment_preparations WHERE id=$1",
          [run.preparation_id],
        )
      ).rows[0];
      if (!preparation) throw invalid("input_invalid");
      await this.checkCurrent(client, session, preparation.manifest);
      return this.execution!.artifact(
        client,
        session,
        run,
        preparation.manifest,
        request.data,
        request.summary,
      );
    });
  }
  async state(
    ticket: string,
    action: "read" | "write" | "lock" | "unlock",
    raw?: unknown,
    lockId?: string,
  ) {
    if (!this.execution) throw invalid("execution_disabled", 503);
    const { session, id } = await this.resolve(ticket);
    return withTenant(this.pool, session, async (client) => {
      const run = (
        await client.query(
          `SELECT * FROM lzc.plan_runs WHERE id=$1 AND status IN ${live} AND expires_at>now() FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!run) throw invalid("invalid_runner_ticket", 401);
      return this.execution!.state(client, session, run, action, raw, lockId);
    });
  }
  async migration(ticket: string, raw: unknown) {
    const request = z
      .strictObject({ phase: z.enum(["prepare", "complete"]) })
      .parse(raw);
    if (!this.execution) throw invalid("execution_disabled", 503);
    const { session, id } = await this.resolve(ticket);
    return withTenant(this.pool, session, async (client) => {
      const run = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 AND expires_at>now() AND lzc.deployment_role() FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!run) throw invalid("invalid_runner_ticket", 401);
      const preparation = (
        await client.query(
          "SELECT manifest FROM lzc.deployment_preparations WHERE id=$1",
          [run.preparation_id],
        )
      ).rows[0];
      if (!preparation) throw invalid("input_invalid");
      return this.execution!.migration(
        client,
        session,
        run,
        request.phase,
        preparation.manifest.organization.id,
      );
    });
  }
  async recovery(ticket: string, raw: unknown) {
    const request = z
      .strictObject({
        data: z
          .string()
          .min(4)
          .max(22 * 1024 * 1024),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .parse(raw);
    try {
      canonicalBase64(request.data, 16 * 1024 * 1024);
    } catch {
      throw invalid("recovery_invalid", 400);
    }
    if (!this.execution) throw invalid("execution_disabled", 503);
    const { session, id } = await this.resolve(ticket);
    return withTenant(this.pool, session, async (client) => {
      const run = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 AND expires_at>now() AND lzc.deployment_role() FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!run) throw invalid("invalid_runner_ticket", 401);
      return this.execution!.recovery(
        client,
        session,
        run,
        request.data,
        request.sha256,
      );
    });
  }
  async outputs(session: Session, id: string, withSource = false) {
    if (!this.execution) throw invalid("execution_disabled", 503);
    return withTenant(this.pool, session, async (client) => {
      const run = (
        await client.query(
          "SELECT * FROM lzc.plan_runs WHERE id=$1 AND operation='apply' AND status='succeeded'",
          [z.uuid().parse(id)],
        )
      ).rows[0];
      if (!run) throw invalid("apply_not_succeeded", 404);
      const state = (
        await client.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1",
          [run.state_key],
        )
      ).rows[0];
      const preparation = (
        await client.query(
          "SELECT manifest FROM lzc.deployment_preparations WHERE id=$1",
          [run.preparation_id],
        )
      ).rows[0];
      if (
        !state ||
        state.lock_run_id ||
        !preparation ||
        String(state.version) !== String(run.applied_state_version)
      )
        throw invalid("platform_contract_unavailable");
      let raw: unknown;
      try {
        const current = await this.execution!.current(client, session, state);
        const document =
          current.remote?.document ??
          JSON.parse(
            this.execution!.bootstrap(session, state).toString("utf8"),
          );
        const output =
          document.outputs?.platform_contract ??
          document.outputs?.application_platform_contract;
        if (output?.sensitive === true)
          throw invalid("platform_contract_unavailable");
        raw = output?.value;
      } catch {
        throw invalid("state_failed");
      }
      const parsed = platformContractSchema.safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.tenant_id !== session.tenantId ||
        parsed.data.organization_id !== preparation.manifest.organization.id
      )
        throw invalid("platform_contract_unavailable");
      if (
        Object.keys(parsed.data.targets).length > 100 ||
        Object.values(parsed.data.targets).some(
          (target) =>
            (target.firewall_next_hop_ip !== null &&
              isIP(target.firewall_next_hop_ip) !== 4) ||
            (target.ipv4_nameservers !== null &&
              (target.ipv4_nameservers.length > 16 ||
                target.ipv4_nameservers.some(
                  (address) => isIP(address) !== 4,
                ))),
        )
      )
        throw invalid("platform_contract_unavailable");
      return {
        applicationPlatformContract: parsed.data,
        ...(withSource
          ? {
              source: {
                applyRunId: run.id as string,
                stateKey: run.state_key as string,
                stateVersion: String(state.version),
                contractRevision: parsed.data.revision,
                documentSha256: sha256(canonicalJson(parsed.data)),
              },
            }
          : {}),
      };
    });
  }
  async maintain() {
    const rows = (
      await this.pool.query("SELECT * FROM lzc_auth.expire_plan_runs()")
    ).rows;
    for (const row of rows) {
      await this.runner.remove(row.id, row.runner_app_id);
      await this.pool.query("SELECT lzc_auth.mark_plan_cleaned($1)", [row.id]);
    }
  }
}
