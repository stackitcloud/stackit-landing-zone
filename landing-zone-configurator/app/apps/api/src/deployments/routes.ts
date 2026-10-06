import { platformUpgradeAcceleratorCommit } from "@lzc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { ConfigurationError } from "../configurations/service.js";
import { CredentialError } from "../credentials/profiles.js";
import { RepositoryError, repositoryTarget } from "../github/repositories.js";
import type { Preparations } from "./preparations.js";

export function registerPreparations(
  app: FastifyInstance,
  auth: AuthServices,
  preparations: Pick<Preparations, "list" | "create" | "remove">,
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
      if (
        error instanceof CredentialError ||
        error instanceof RepositoryError ||
        error instanceof ConfigurationError
      )
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_preparation_request" });
      app.log.warn({ event: "preparation_failed" }, "Preparation failed");
      return reply.code(503).send({ error: "preparation_failed" });
    });
    routes.get("/api/v1/preparations", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      return { preparations: await preparations.list(session) };
    });
    routes.post("/api/v1/preparations", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const input = z
        .union([
          z
            .object({
              target: repositoryTarget,
              configurationId: z.uuid(),
              head: z.string().regex(/^[a-f0-9]{40}$/),
              credentialId: z.uuid(),
              backendId: z.uuid().optional(),
              platformUpgrade: z
                .strictObject({
                  confirm: z.literal(true),
                  acceleratorCommit: z.literal(
                    platformUpgradeAcceleratorCommit,
                  ),
                })
                .optional(),
            })
            .strict(),
          z
            .object({
              source: z.literal("database"),
              configurationId: z.uuid(),
              revision: z.number().int().positive(),
              credentialId: z.uuid(),
              backendId: z.uuid().optional(),
              platformUpgrade: z
                .strictObject({
                  confirm: z.literal(true),
                  acceleratorCommit: z.literal(
                    platformUpgradeAcceleratorCommit,
                  ),
                })
                .optional(),
            })
            .strict(),
        ])
        .parse(request.body);
      const token = "target" in input ? await auth.tokens.get(session) : null;
      const result = await preparations.create(session, token, input);
      return reply.code(201).send(result);
    });
    routes.delete("/api/v1/preparations/:id", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const { id } = z.object({ id: z.uuid() }).strict().parse(request.params);
      await preparations.remove(session, id);
      return reply.code(204).send();
    });
  });
}
