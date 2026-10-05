import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { CredentialError } from "../credentials/profiles.js";
import { type Backends, registerBackendSchema } from "./backends.js";

export function registerBackends(
  app: FastifyInstance,
  auth: AuthServices,
  backends: Pick<
    Backends,
    "list" | "register" | "configuration" | "configurationForSource"
  >,
) {
  app.register(async (routes) => {
    routes.addHook("preHandler", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (
        session.tenantKind === "organisation" &&
        !session.productRoles?.includes("platform-engineer")
      )
        return reply.code(403).send({ error: "platform_engineer_required" });
      if (
        request.method !== "GET" &&
        !validMutation(request, session, auth.origin)
      )
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
    });
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (error instanceof CredentialError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_backend_request" });
      return reply.code(503).send({ error: "backend_request_failed" });
    });
    routes.get("/api/v1/backends", async (request) => {
      const { configurationId } = z
        .strictObject({ configurationId: z.uuid().optional() })
        .parse(request.query);
      const session = (await authenticatedSession(request, auth))!;
      return configurationId
        ? backends.configurationForSource(session, configurationId)
        : backends.list(session);
    });
    routes.post(
      "/api/v1/backends",
      { bodyLimit: 16384 },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await backends.register(
              (await authenticatedSession(request, auth))!,
              registerBackendSchema.parse(request.body),
            ),
          ),
    );
    routes.get("/api/v1/backends/:id/configuration", async (request) => {
      const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
      return backends.configuration(
        (await authenticatedSession(request, auth))!,
        id,
      );
    });
  });
}
