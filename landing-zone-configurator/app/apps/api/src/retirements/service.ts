import {
  retirementCandidateSchema,
  retirementMutationSchema,
  retirementSchema,
  retirementStartSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { withTenant } from "../storage/database.js";
import type { RetirementStartSource } from "./start-source.js";

export class Retirements {
  constructor(
    private readonly pool: pg.Pool,
    private readonly source?: Pick<RetirementStartSource, "read">,
  ) {}
  async candidates(session: Session) {
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query(
        "SELECT lzc_auth.retirement_candidates($1) AS value",
        [session.id],
      );
      return z.array(retirementCandidateSchema).parse(result.rows[0].value);
    });
  }
  async list(session: Session) {
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query(
        "SELECT lzc_auth.retirement_list($1) AS value",
        [session.id],
      );
      return z.array(retirementSchema).parse(result.rows[0].value);
    });
  }
  async start(session: Session, raw: unknown) {
    const input = retirementStartSchema.parse(raw);
    const source = await this.source?.read(session, input.stateKey);
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query(
        source
          ? "SELECT lzc_auth.retirement_start($1,$2,$3,$4,$5,$6::uuid[]) AS value"
          : "SELECT lzc_auth.retirement_start($1,$2,$3,$4) AS value",
        [
          session.id,
          input.stateKey,
          input.reason,
          input.notBefore ?? null,
          ...(source ? [source.applyRunId, source.folders] : []),
        ],
      );
      return retirementSchema.parse(result.rows[0].value);
    });
  }
  async change(session: Session, id: string, raw: unknown) {
    const input = retirementMutationSchema.parse(raw);
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query(
        input.action === "reschedule"
          ? "SELECT lzc_auth.retirement_reschedule($1,$2,$3,$4::timestamptz) AS value"
          : "SELECT lzc_auth.retirement_change($1,$2,$3,$4::text) AS value",
        [
          session.id,
          z.uuid().parse(id),
          input.generation,
          input.action === "reschedule"
            ? (input.notBefore ?? null)
            : input.action,
        ],
      );
      return retirementSchema.parse(result.rows[0].value);
    });
  }
}
