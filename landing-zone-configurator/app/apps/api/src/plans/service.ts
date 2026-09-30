import { createHash, randomBytes, randomUUID } from "node:crypto";
import { planResultSchema, planStageSchema } from "@lzc/contracts";
import { configurationValues, serializeTfvars } from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import { type Session, tokenHash } from "../auth/store.js";
import {
  CredentialError,
  type PostgresCredentialProfiles,
} from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import {
  acceleratorCommit,
  type PreparationManifest,
} from "../deployments/preparations.js";
import type { Repositories } from "../github/repositories.js";
import { withTenant } from "../storage/database.js";
import type { PlanRunner } from "./cloud-foundry.js";

const live = "('starting','initializing','validating','planning')";
const lockHash =
  "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888";
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
  ) {}
  async list(session: Session) {
    return withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query(
            'SELECT id,preparation_id AS "preparationId",status,summary,error_code AS "errorCode",created_at AS "createdAt",finished_at AS "finishedAt" FROM lzc.plan_runs ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  private async preparation(session: Session, id: string) {
    return withTenant(this.pool, session, async (c) => {
      const roles = await c.query(
        "SELECT role FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
        [session.tenantId, session.userId],
      );
      if (!["admin", "deployer"].includes(roles.rows[0]?.role))
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
      return manifest;
    });
  }
  private async verify(session: Session, manifest: PreparationManifest) {
    const checked = await this.profiles.verifyForPreparation(
      session,
      manifest.credential.id,
      manifest.organization.id,
    );
    if (checked.check.status !== "passed")
      throw invalid("access_check_failed", 422);
    if (
      checked.version !== manifest.credential.secretVersion ||
      checked.keyId !== manifest.credential.keyId
    )
      throw invalid("credential_changed");
  }
  async start(session: Session, token: string, preparationId: string) {
    const manifest = await this.preparation(session, preparationId);
    await this.repos.prepareSnapshot(
      token,
      manifest.source.repository,
      manifest.source.configurationId,
      manifest.source.commit,
    );
    await this.verify(session, manifest);
    const id = randomUUID(),
      ticket = randomBytes(32).toString("base64url");
    await withTenant(this.pool, session, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `plans:${session.userId}`,
      ]);
      const active = await c.query(
        `SELECT id FROM lzc.plan_runs WHERE status IN ${live}`,
      );
      if (active.rowCount) throw invalid("plan_already_running");
      const recent = await c.query(
        "SELECT count(*)::int AS count FROM lzc.plan_runs WHERE created_at>now()-interval '1 day'",
      );
      if (recent.rows[0].count >= 20) throw invalid("plan_daily_limit");
      await c.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          session.tenantId,
          session.userId,
          preparationId,
          tokenHash(ticket),
        ],
      );
    });
    // Durable row precedes dispatch. No automatic replay after an ambiguous external call.
    void this.runner
      .start(id, ticket, this.origin, async (appId, sourceDropletId) => {
        await withTenant(this.pool, session, async (c) => {
          const row = await c.query(
            `UPDATE lzc.plan_runs SET runner_app_id=$2,runner_droplet_id=$3 WHERE id=$1 AND status IN ${live} AND expires_at>now()`,
            [id, appId, sourceDropletId],
          );
          if (!row.rowCount) throw invalid("runner_unavailable");
        });
      })
      .catch(async () => {
        await withTenant(this.pool, session, async (c) => {
          await c.query(
            `UPDATE lzc.plan_runs SET status='failed',error_code='runner_unavailable',finished_at=now() WHERE id=$1 AND status IN ${live}`,
            [id],
          );
        });
      })
      .catch(() => {});
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
    const preparationId = await withTenant(this.pool, session, async (c) => {
      const row = (
        await c.query(
          `UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1 AND NOT input_claimed AND status='starting' AND expires_at>now() RETURNING preparation_id`,
          [id],
        )
      ).rows[0];
      if (!row) throw invalid("invalid_runner_ticket", 401);
      return row.preparation_id as string;
    });
    const manifest = await this.preparation(session, preparationId);
    await this.verify(session, manifest);
    const secret = await this.secrets.get(session, manifest.credential.id);
    if (
      secret.version !== manifest.credential.secretVersion ||
      secret.key.credentials.kid !== manifest.credential.keyId
    )
      throw invalid("credential_changed");
    const tfvars = serializeTfvars(configurationValues(manifest.configuration));
    if (
      createHash("sha256").update(tfvars).digest("hex") !==
      manifest.tfvarsSha256
    )
      throw invalid("input_invalid");
    await withTenant(this.pool, session, async (c) => {
      const valid = await c.query(
        `SELECT r.id FROM lzc.plan_runs r JOIN lzc.memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.owner_user_id WHERE r.id=$1 AND r.status='initializing' AND r.expires_at>now() AND m.role IN ('admin','deployer')`,
        [id],
      );
      if (!valid.rowCount) throw invalid("invalid_runner_ticket", 401);
    });
    return {
      id,
      mode: "initial-plan-only",
      acceleratorCommit,
      lockHash,
      tfvars,
      tfvarsSha256: manifest.tfvarsSha256,
      key: secret.key,
    };
  }
  async stage(ticket: string, raw: unknown) {
    const { session, id } = await this.resolve(ticket);
    const stage = planStageSchema.parse(raw);
    const previous = {
      initializing: "initializing",
      validating: "initializing",
      planning: "validating",
    }[stage];
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        "UPDATE lzc.plan_runs SET status=$2 WHERE id=$1 AND status=$3 AND input_claimed AND expires_at>now()",
        [id, stage, previous],
      );
      if (!row.rowCount) throw invalid("invalid_runner_transition");
    });
  }
  async result(ticket: string, raw: unknown) {
    const { session, id } = await this.resolve(ticket);
    const result = planResultSchema.parse(raw);
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        `UPDATE lzc.plan_runs SET status=$2,summary=$3,error_code=$4,finished_at=now() WHERE id=$1 AND status IN ${result.status === "succeeded" ? "('planning')" : live} AND expires_at>now()`,
        [
          id,
          result.status,
          result.status === "succeeded" ? JSON.stringify(result.summary) : null,
          result.status === "failed" ? result.errorCode : null,
        ],
      );
      if (!row.rowCount) throw invalid("invalid_runner_transition");
    });
  }
  async cancel(session: Session, id: string) {
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        `UPDATE lzc.plan_runs SET status='cancelled',error_code='cancelled',finished_at=now() WHERE id=$1 AND status IN ${live}`,
        [z.uuid().parse(id)],
      );
      if (!row.rowCount) throw invalid("plan_not_active", 404);
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
