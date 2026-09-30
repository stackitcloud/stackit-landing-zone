import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { CredentialError } from "../credentials/profiles.js";
import { RepositoryError } from "../github/repositories.js";
import type { Plans } from "./service.js";
export function registerPlans(
  app: FastifyInstance,
  auth: AuthServices,
  plans: Pick<
    Plans,
    "list" | "start" | "cancel" | "input" | "stage" | "result"
  >,
) {
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof CredentialError || error instanceof RepositoryError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_plan_request" });
      app.log.warn({ event: "plan_request_failed" }, "Plan request failed");
      return reply.code(503).send({ error: "plan_request_failed" });
    });
    routes.register(async (user) => {
      user.addHook("preHandler", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        if (
          request.method !== "GET" &&
          !validMutation(request, session, auth.origin)
        )
          return reply
            .code(403)
            .send({ error: "invalid_request_origin_or_csrf" });
      });
      user.get("/api/v1/plans", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        return { runs: await plans.list(session) };
      });
      user.post("/api/v1/plans", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        const input = z
          .object({
            preparationId: z.uuid(),
            confirmNewDeployment: z.literal(true),
          })
          .strict()
          .parse(request.body);
        return reply
          .code(202)
          .send(
            await plans.start(
              session,
              await auth.tokens.get(session),
              input.preparationId,
            ),
          );
      });
      user.post("/api/v1/plans/:id/cancel", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        await plans.cancel(session, id);
        return reply.code(204).send();
      });
    });
    const ticket = (authorization: string | undefined) => {
      if (!authorization?.startsWith("Bearer "))
        throw new CredentialError(401, "invalid_runner_ticket");
      return authorization.slice(7);
    };
    routes.post("/api/runner/input", async (request) =>
      plans.input(ticket(request.headers.authorization)),
    );
    routes.post("/api/runner/stage", async (request, reply) => {
      const { stage } = z
        .object({ stage: z.string() })
        .strict()
        .parse(request.body);
      await plans.stage(ticket(request.headers.authorization), stage);
      return reply.code(204).send();
    });
    routes.post("/api/runner/result", async (request, reply) => {
      await plans.result(ticket(request.headers.authorization), request.body);
      return reply.code(204).send();
    });
  });
}
