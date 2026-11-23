import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Session } from "../auth/store.js";
import type { Retirements } from "./service.js";

export function registerRetirements(
  app: FastifyInstance,
  auth: AuthServices,
  retirements: Pick<Retirements, "list" | "start" | "change" | "candidates">,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_retirement_request" });
      const e = error as { code?: string; message?: string };
      if (e.code === "42501")
        return reply.code(403).send({ error: "retirement_access_denied" });
      if (e.code === "40001" || e.code === "55000")
        return reply.code(409).send({
          error: /^retirement_[a-z_]+$/.test(e.message ?? "")
            ? e.message
            : "retirement_changed",
        });
      app.log.warn(
        { event: "retirement_request_failed" },
        "Retirement request failed",
      );
      return reply.code(503).send({ error: "retirement_unavailable" });
    });
    routes.addHook("preHandler", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (
        request.headers["x-lzc-tenant"] !== session.tenantId ||
        (request.method !== "GET" &&
          !validMutation(request, session, auth.origin))
      )
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      sessions.set(request, session);
    });
    routes.get("/api/v1/retirements/candidates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return retirements.candidates(session);
    });
    routes.get("/api/v1/retirements", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return retirements.list(session);
    });
    routes.post(
      "/api/v1/retirements",
      { bodyLimit: 4096 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return retirements.start(session, request.body);
      },
    );
    routes.post(
      "/api/v1/retirements/:id",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return retirements.change(
          session,
          z.object({ id: z.uuid() }).parse(request.params).id,
          request.body,
        );
      },
    );
  });
}
