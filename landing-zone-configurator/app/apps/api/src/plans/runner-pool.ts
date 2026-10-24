import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type RunnerPoolAssignment,
  runnerPoolAssignmentSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type {
  CloudFoundryPlanRunner,
  WarmRunnerDispatch,
} from "./cloud-foundry.js";
import type { ArtifactCrypto } from "./crypto.js";

type Slot = {
  id: string;
  appId: string | null;
  sourceDropletId: string;
};
const columns = 'id,app_id AS "appId",source_droplet_id AS "sourceDropletId"';
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function runnerPoolSize(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^[0-4]$/.test(value)) throw new Error("runner_pool_size_invalid");
  return Number(value);
}

export class RunnerPoolAuthorizationError extends Error {}

export class RunnerPool implements WarmRunnerDispatch {
  private readonly key: string;
  private maintaining = false;
  constructor(
    private readonly database: pg.Pool,
    private readonly crypto: ArtifactCrypto | undefined,
    private readonly driver: Pick<
      CloudFoundryPlanRunner,
      "prepareWarm" | "removeWarm"
    >,
    private readonly config: {
      size: number;
      origin: string;
      spaceId: string;
      templateId: string;
      dropletId?: string;
    },
  ) {
    if (!Number.isInteger(config.size) || config.size < 0 || config.size > 4)
      throw new Error("runner_pool_size_invalid");
    if (config.size > 0 && (!config.dropletId || !crypto))
      throw new Error("runner_pool_execution_required");
    const origin = new URL(config.origin);
    if (origin.protocol !== "https:" || origin.origin !== config.origin)
      throw new Error("runner_pool_origin_invalid");
    for (const id of [
      config.spaceId,
      config.templateId,
      ...(config.dropletId ? [config.dropletId] : []),
    ])
      z.uuid().parse(id);
    this.key = hash(
      JSON.stringify([
        config.origin,
        config.spaceId,
        config.templateId,
        config.dropletId,
      ]),
    );
  }

  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  private async createSlot(): Promise<{ id: string; ticket: string } | null> {
    const id = randomUUID();
    const ticket = randomBytes(32).toString("base64url");
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`runner-pool:${this.key}`],
      );
      const result = await client.query(
        "INSERT INTO lzc.runner_pool_slots(id,pool_key,origin,space_id,source_droplet_id,token_hash,status,expires_at) SELECT $1,$2,$3,$4,$5,$6,'warming',now()+interval '2 minutes' WHERE (SELECT count(*) FROM lzc.runner_pool_slots WHERE pool_key=$2 AND status IN ('warming','ready'))<$7 RETURNING id",
        [
          id,
          this.key,
          this.config.origin,
          this.config.spaceId,
          this.config.dropletId,
          hash(ticket),
          this.config.size,
        ],
      );
      return result.rowCount ? { id, ticket } : null;
    });
  }

  async claim(
    id: string,
    ticket: string,
  ): Promise<RunnerPoolAssignment | null> {
    const crypto = this.crypto;
    if (!crypto) throw new RunnerPoolAuthorizationError();
    if (!z.uuid().safeParse(id).success || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw new RunnerPoolAuthorizationError();
    return this.transaction(async (client) => {
      const result = await client.query<{
        status: string;
        assignment: Buffer | null;
      }>(
        "SELECT status,assignment FROM lzc.runner_pool_slots WHERE id=$1 AND token_hash=$2 AND pool_key=$3 AND expires_at>now() AND app_id IS NOT NULL FOR UPDATE",
        [id, hash(ticket), this.key],
      );
      const slot = result.rows[0];
      if (
        !slot ||
        !["warming", "ready", "reserved", "assigned"].includes(slot.status)
      )
        throw new RunnerPoolAuthorizationError();
      if (slot.status === "assigned") {
        if (!slot.assignment) throw new Error("runner_pool_assignment_missing");
        const assignment = runnerPoolAssignmentSchema.parse(
          JSON.parse(
            crypto
              .decrypt(slot.assignment, "runner-pool", this.key, id)
              .toString("utf8"),
          ),
        );
        await client.query(
          "UPDATE lzc.runner_pool_slots SET status='consumed',assignment=NULL,token_hash=NULL,last_seen_at=now() WHERE id=$1",
          [id],
        );
        return assignment;
      }
      await client.query(
        "UPDATE lzc.runner_pool_slots SET expires_at=CASE WHEN status='warming' THEN now()+interval '10 minutes' ELSE expires_at END,status=CASE WHEN status='warming' THEN 'ready' ELSE status END,last_seen_at=now() WHERE id=$1",
        [id],
      );
      return null;
    });
  }

  async start(
    id: string,
    ticket: string,
    origin: string,
    broker: "platform" | "application",
    record: (appId: string, sourceDropletId: string) => Promise<void>,
    probe = false,
  ): Promise<boolean> {
    if (!this.config.size) return false;
    const crypto = this.crypto;
    if (!crypto) throw new Error("runner_pool_execution_required");
    if (origin !== this.config.origin)
      throw new Error("runner_pool_origin_mismatch");
    const assignment = runnerPoolAssignmentSchema.parse({ id, ticket, broker });
    const reserve = () =>
      this.transaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`runner-pool-job:${id}`],
        );
        const existing = await client.query(
          "SELECT id FROM lzc.runner_pool_slots WHERE job_id=$1",
          [id],
        );
        if (existing.rowCount)
          throw new Error("runner_pool_job_already_dispatched");
        const reserved = await client.query<Slot>(
          `WITH candidate AS (SELECT id FROM lzc.runner_pool_slots WHERE pool_key=$1 AND status='ready' AND last_seen_at>now()-interval '10 seconds' AND expires_at>now()+interval '30 seconds' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE lzc.runner_pool_slots s SET status='reserved',job_id=$2,is_probe=$3,expires_at=now()+interval '30 seconds' FROM candidate WHERE s.id=candidate.id RETURNING s.id,s.app_id AS "appId",s.source_droplet_id AS "sourceDropletId"`,
          [this.key, id, probe],
        );
        return reserved.rows[0];
      });
    let slot = await reserve();
    // A heartbeat briefly locks the same row. Retry only a known, still-ready
    // candidate skipped before reservation; never replay an assignment or error.
    for (let attempt = 0; !slot && attempt < 4; attempt++) {
      const eligible = await this.database.query<{ ready: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM lzc.runner_pool_slots WHERE pool_key=$1 AND status='ready' AND last_seen_at>now()-interval '10 seconds' AND expires_at>now()+interval '30 seconds') AS ready",
        [this.key],
      );
      if (!eligible.rows[0]?.ready) break;
      await sleep(50);
      slot = await reserve();
    }
    if (!slot) return false;
    try {
      if (!slot.appId) throw new Error("runner_pool_app_missing");
      await record(slot.appId, slot.sourceDropletId);
      const ciphertext = crypto.encrypt(
        Buffer.from(JSON.stringify(assignment)),
        "runner-pool",
        this.key,
        slot.id,
      );
      const updated = await this.database.query(
        "UPDATE lzc.runner_pool_slots SET status='assigned',assignment=$2,expires_at=now()+interval '30 seconds' WHERE id=$1 AND status='reserved' AND expires_at>now()",
        [slot.id, ciphertext],
      );
      if (updated.rowCount !== 1)
        throw new Error("runner_pool_reservation_expired");
      return true;
    } catch (error) {
      await this.database.query(
        "UPDATE lzc.runner_pool_slots SET status='retiring',assignment=NULL,token_hash=NULL WHERE id=$1 AND status<>'consumed'",
        [slot.id],
      );
      throw error;
    }
  }

  async remove(id: string, appId: string | null): Promise<boolean> {
    z.uuid().parse(id);
    const result = await this.database.query<Slot>(
      `SELECT ${columns} FROM lzc.runner_pool_slots WHERE job_id=$1 AND space_id=$2 AND origin=$3`,
      [id, this.config.spaceId, this.config.origin],
    );
    const slot = result.rows[0];
    if (!slot) return false;
    if (appId && appId !== slot.appId)
      throw new Error("Runner identity mismatch");
    await this.driver.removeWarm(slot.id, slot.appId);
    await this.database.query("DELETE FROM lzc.runner_pool_slots WHERE id=$1", [
      slot.id,
    ]);
    return true;
  }

  async maintain(): Promise<void> {
    if (this.maintaining) return;
    this.maintaining = true;
    try {
      await this.database.query(
        "SELECT lzc_auth.retire_completed_application_runners($1,$2)",
        [this.config.spaceId, this.config.origin],
      );
      await this.database.query(
        "UPDATE lzc.runner_pool_slots SET status='retiring',assignment=NULL,token_hash=NULL WHERE space_id=$1 AND origin=$2 AND ((status IN ('warming','ready','reserved','assigned') AND (expires_at<=now() OR (status='ready' AND last_seen_at<now()-interval '15 seconds') OR ($3=0 AND status IN ('warming','ready')))) OR (status='consumed' AND is_probe AND expires_at<=now()))",
        [this.config.spaceId, this.config.origin, this.config.size],
      );
      const expired = await this.database.query<Slot>(
        `SELECT ${columns} FROM lzc.runner_pool_slots WHERE space_id=$1 AND origin=$2 AND status='retiring' ORDER BY created_at LIMIT 16`,
        [this.config.spaceId, this.config.origin],
      );
      for (const slot of expired.rows) {
        await this.driver.removeWarm(slot.id, slot.appId);
        await this.database.query(
          "DELETE FROM lzc.runner_pool_slots WHERE id=$1",
          [slot.id],
        );
      }
      const pending: { id: string; ticket: string }[] = [];
      for (let index = 0; index < this.config.size; index++) {
        const slot = await this.createSlot();
        if (!slot) break;
        pending.push(slot);
      }
      const launches = await Promise.allSettled(
        pending.map(async (slot) => {
          try {
            await this.driver.prepareWarm(
              slot.id,
              slot.ticket,
              this.config.origin,
              async (appId, sourceDropletId) => {
                if (sourceDropletId !== this.config.dropletId)
                  throw new Error("Runner package changed");
                const recorded = await this.database.query(
                  "UPDATE lzc.runner_pool_slots SET app_id=$2 WHERE id=$1 AND status='warming'",
                  [slot.id, appId],
                );
                if (recorded.rowCount !== 1)
                  throw new Error("runner_pool_slot_retired");
              },
            );
          } catch (error) {
            await this.database.query(
              "UPDATE lzc.runner_pool_slots SET status='retiring',token_hash=NULL WHERE id=$1 AND status IN ('warming','ready')",
              [slot.id],
            );
            throw error;
          }
        }),
      );
      const failure = launches.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    } finally {
      this.maintaining = false;
    }
  }

  async probe() {
    if (!this.config.size) throw new Error("runner_pool_disabled");
    const id = randomUUID();
    const ticket = randomBytes(32).toString("base64url");
    const started = performance.now();
    const deadline = started + 180000;
    let appId: string | null = null;
    let dispatchMilliseconds = 0;
    let readyWaitMilliseconds = 0;
    let assignmentMilliseconds = 0;
    const pause = async () => {
      if (performance.now() > deadline)
        throw new Error("runner_pool_probe_timeout");
      await new Promise((resolve) => setTimeout(resolve, 500));
    };
    try {
      for (;;) {
        const dispatchStart = performance.now();
        const assigned = await this.start(
          id,
          ticket,
          this.config.origin,
          "platform",
          async (value) => {
            appId = value;
          },
          true,
        );
        if (assigned) {
          dispatchMilliseconds = Math.round(performance.now() - dispatchStart);
          readyWaitMilliseconds = Math.round(dispatchStart - started);
          break;
        }
        await pause();
      }
      const handedOff = performance.now();
      for (;;) {
        const result = await this.database.query<{ status: string }>(
          "SELECT status FROM lzc.runner_pool_slots WHERE job_id=$1",
          [id],
        );
        if (result.rows[0]?.status === "consumed") break;
        if (result.rows[0]?.status !== "assigned")
          throw new Error("runner_pool_probe_assignment_lost");
        await pause();
      }
      assignmentMilliseconds = Math.round(performance.now() - handedOff);
    } finally {
      await this.remove(id, appId);
    }
    const replenishStart = performance.now();
    for (;;) {
      const result = await this.database.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM lzc.runner_pool_slots WHERE pool_key=$1 AND status='ready' AND last_seen_at>now()-interval '10 seconds' AND expires_at>now()+interval '30 seconds'",
        [this.key],
      );
      if ((result.rows[0]?.count ?? 0) >= this.config.size) break;
      await pause();
    }
    return {
      readyWaitMilliseconds,
      dispatchMilliseconds,
      assignmentMilliseconds,
      replenishMilliseconds: Math.round(performance.now() - replenishStart),
    };
  }
}
