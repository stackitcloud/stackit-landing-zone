import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import {
  catalogueRequest,
  type PostgresCloudCatalogues,
} from "./catalogues.js";
import { CredentialError } from "./profiles.js";

export function registerCloudCatalogues(
  app: FastifyInstance,
  auth: AuthServices,
  catalogues: Pick<PostgresCloudCatalogues, "load"> &
    Partial<Pick<PostgresCloudCatalogues, "automatic">>,
) {
  app.post(
    "/api/v1/cloud-catalogues/automatic",
    { bodyLimit: 1024 },
    async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (!validMutation(request, session, auth.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      if (request.headers["x-lzc-tenant"] !== session.tenantId)
        return reply.code(409).send({ error: "stale_tenant_context" });
      try {
        const input = z
          .strictObject({ region: z.enum(["eu01", "eu02"]) })
          .parse(request.body);
        z.strictObject({}).parse(request.query ?? {});
        if (!catalogues.automatic)
          return reply.code(503).send({ error: "cloud_catalogue_unavailable" });
        return await catalogues.automatic(session, input.region);
      } catch (error) {
        if (error instanceof z.ZodError)
          return reply.code(400).send({ error: "invalid_catalogue_request" });
        if (error instanceof CredentialError)
          return reply.code(error.status).send({ error: error.code });
        return reply.code(503).send({ error: "cloud_catalogue_unavailable" });
      }
    },
  );
  app.post(
    "/api/v1/cloud-catalogues",
    { bodyLimit: 4096 },
    async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (!validMutation(request, session, auth.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      try {
        return await catalogues.load(
          session,
          catalogueRequest.parse(request.body),
        );
      } catch (error) {
        if (error instanceof z.ZodError)
          return reply.code(400).send({ error: "invalid_catalogue_request" });
        if (error instanceof CredentialError)
          return reply.code(error.status).send({ error: error.code });
        return reply.code(503).send({ error: "cloud_catalogue_unavailable" });
      }
    },
  );
}
