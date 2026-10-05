import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { ConfigurationError, type Configurations } from "./service.js";

export function registerConfigurations(
  app: FastifyInstance,
  auth: AuthServices,
  configurations: Pick<
    Configurations,
    "list" | "get" | "create" | "update" | "remove"
  >,
) {
  app.register(async (routes) => {
    routes.addHook("preHandler", async (request, reply) => {
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
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ConfigurationError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_configuration_request" });
      if ((error as { code?: string }).code === "42501")
        return reply.code(403).send({ error: "configuration_access_denied" });
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply
          .code(413)
          .send({ error: "configuration_document_too_large" });
      app.log.warn(
        { event: "configuration_operation_failed" },
        "Configuration operation failed",
      );
      return reply.code(503).send({ error: "configuration_operation_failed" });
    });
    routes.get("/api/v1/configurations", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      return { configurations: await configurations.list(session) };
    });
    routes.get("/api/v1/configurations/:id", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { id } = z.object({ id: z.uuid() }).strict().parse(request.params);
      return { configuration: await configurations.get(session, id) };
    });
    routes.post("/api/v1/configurations", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { draft } = z
        .object({ draft: z.unknown() })
        .strict()
        .parse(request.body);
      return reply
        .code(201)
        .send({ configuration: await configurations.create(session, draft) });
    });
    routes.put("/api/v1/configurations/:id", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { id } = z.object({ id: z.uuid() }).strict().parse(request.params);
      const { draft, revision } = z
        .object({ draft: z.unknown(), revision: z.number().int().positive() })
        .strict()
        .parse(request.body);
      return {
        configuration: await configurations.update(
          session,
          id,
          revision,
          draft,
        ),
      };
    });
    routes.delete("/api/v1/configurations/:id", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { id } = z.object({ id: z.uuid() }).strict().parse(request.params);
      const { revision } = z
        .object({ revision: z.number().int().positive() })
        .strict()
        .parse(request.body);
      await configurations.remove(session, id, revision);
      return reply.code(204).send();
    });
  });
}
