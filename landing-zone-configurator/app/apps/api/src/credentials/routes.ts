import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { parseServiceAccountKey } from "./key.js";
import { CredentialError, type CredentialProfiles } from "./profiles.js";

export function registerCredentials(
  app: FastifyInstance,
  auth: AuthServices,
  profiles: CredentialProfiles,
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
      if (error instanceof CredentialError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_credential_request" });
      // Neither request bodies, key parser errors nor secret-store responses are logged.
      app.log.warn(
        { event: "credential_operation_failed" },
        "Credential operation failed",
      );
      return reply.code(503).send({ error: "credential_operation_failed" });
    });
    routes.get("/api/v1/credentials", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      return { profiles: await profiles.list(session) };
    });
    routes.post(
      "/api/v1/credentials",
      { bodyLimit: 32768 },
      async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const input = z
          .object({
            name: z.string().trim().min(1).max(64),
            serviceAccountKey: z.unknown(),
          })
          .strict()
          .parse(request.body);
        let key: ReturnType<typeof parseServiceAccountKey>;
        try {
          key = parseServiceAccountKey(input.serviceAccountKey);
        } catch {
          return reply.code(400).send({ error: "invalid_service_account_key" });
        }
        await profiles.create(session, input.name, key);
        return reply.code(201).send({ stored: true });
      },
    );
    routes.delete("/api/v1/credentials/:id", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { id } = z.object({ id: z.uuid() }).strict().parse(request.params);
      await profiles.remove(session, id);
      return reply.code(204).send();
    });
  });
}
