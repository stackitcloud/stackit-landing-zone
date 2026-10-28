import { createHash } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { CloudFoundryPlanRunner } from "./cloud-foundry.js";

export const runnerOwner = (origin: string) =>
  createHash("sha256")
    .update(new URL(origin).origin)
    .digest("hex")
    .slice(0, 32);
export type CleanupApp = {
  id: string;
  name: string;
  createdAt: string;
  state: string;
  owner: string | null;
};
export class RunnerCleanup {
  private page = 1;
  private running = false;
  constructor(
    private readonly database: pg.Pool,
    private readonly driver: Pick<
      CloudFoundryPlanRunner,
      "cleanupPage" | "deleteStoppedRunner"
    >,
    private readonly origin: string,
  ) {}
  async maintain() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.driver.cleanupPage(this.page);
      this.page = result.nextPage ?? 1;
      const summary = {
        scanned: result.apps.length,
        deleted: 0,
        protected: 0,
        unassociated: 0,
      };
      for (const app of result.apps) {
        const match = /^lzc-(plan|warm)-(.+)$/.exec(app.name);
        if (
          !match ||
          !z.uuid().safeParse(match[2]).success ||
          app.state !== "STOPPED" ||
          !Number.isFinite(Date.parse(app.createdAt)) ||
          Date.parse(app.createdAt) > Date.now() - 86400000
        )
          continue;
        if (app.owner !== null && app.owner !== runnerOwner(this.origin))
          continue;
        const [kind, id] = [match[1]!, match[2]!];
        const eligible = async (count = false) => {
          const { rows } = await this.database.query<{ disposition: string }>(
            "SELECT lzc_auth.runner_cleanup_disposition($1,$2,$3) AS disposition",
            [id, app.id, kind],
          );
          const allowed =
            rows[0]?.disposition === "completed" ||
            (rows[0]?.disposition === "orphan" &&
              app.owner === runnerOwner(this.origin));
          if (count && !allowed) {
            if (rows[0]?.disposition === "orphan") summary.unassociated++;
            else summary.protected++;
          }
          return allowed;
        };
        if (!(await eligible(true))) continue;
        if (await this.driver.deleteStoppedRunner(app, eligible)) {
          await this.database.query(
            "SELECT lzc_auth.record_runner_cleanup($1,$2,$3)",
            [id, app.id, kind],
          );
          summary.deleted++;
        }
      }
      return summary;
    } finally {
      this.running = false;
    }
  }
}
