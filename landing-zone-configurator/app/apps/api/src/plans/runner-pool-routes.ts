import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type RunnerPool,
  RunnerPoolAuthorizationError,
} from "./runner-pool.js";

export function registerRunnerPool(
  app: FastifyInstance,
  pool: Pick<RunnerPool, "claim">,
) {
  app.post("/api/internal/runner-pool/:id/claim", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authorization = request.headers.authorization;
    if (!authorization?.match(/^Bearer [A-Za-z0-9_-]{43}$/))
      return reply.code(401).send({ error: "runner_pool_unauthorized" });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success || request.body !== undefined)
      return reply.code(400).send({ error: "runner_pool_request_invalid" });
    try {
      const assignment = await pool.claim(
        params.data.id,
        authorization.slice(7),
      );
      return assignment ? reply.send(assignment) : reply.code(204).send();
    } catch (error) {
      if (error instanceof RunnerPoolAuthorizationError)
        return reply.code(401).send({ error: "runner_pool_unauthorized" });
      app.log.warn(
        { event: "runner_pool_claim_failed" },
        "Runner pool claim failed",
      );
      return reply.code(503).send({ error: "runner_pool_claim_failed" });
    }
  });
}
