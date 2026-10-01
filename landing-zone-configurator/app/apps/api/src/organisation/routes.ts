import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { OrganisationService } from "./service.js";
export function registerOrganisations(
  app: FastifyInstance,
  auth: AuthServices,
  service: OrganisationService,
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
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_organisation_request" });
      const code = (error as { code?: string }).code;
      if (code === "23505")
        return reply.code(409).send({ error: "organisation_already_exists" });
      if (code === "55000")
        return reply.code(409).send({ error: "organisation_not_empty_draft" });
      if (code === "40001")
        return reply.code(409).send({ error: "stale_tenant_context" });
      if (code === "42501")
        return reply
          .code(403)
          .send({ error: "membership_management_forbidden" });
      if (code === "23503")
        return reply.code(400).send({ error: "registered_user_required" });
      if (code === "23514")
        return reply.code(409).send({ error: "membership_constraints" });
      if (code === "P0002")
        return reply.code(401).send({ error: "authentication_required" });
      app.log.warn(
        { event: "organisation_operation_failed" },
        "Organisation operation failed",
      );
      return reply.code(503).send({ error: "organisation_operation_failed" });
    });
    routes.get("/api/v1/organisation", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      return service.overview(session);
    });
    routes.post(
      "/api/v1/organisation",
      { bodyLimit: 4096 },
      async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const input = z
          .object({
            name: z.string().trim().min(1).max(120),
            organizationId: z.uuid(),
          })
          .strict()
          .parse(request.body);
        return reply.code(201).send({
          id: await service.create(session, input.name, input.organizationId),
        });
      },
    );
    routes.post("/api/v1/organisation/switch", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const input = z
        .object({ tenantId: z.uuid() })
        .strict()
        .parse(request.body);
      await service.switch(session, input.tenantId);
      return { switched: true };
    });
    routes.delete(
      "/api/v1/organisation/workspaces/:tenantId",
      async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const { tenantId } = z
          .object({ tenantId: z.uuid() })
          .strict()
          .parse(request.params);
        if (request.headers["x-lzc-tenant"] !== tenantId)
          return reply.code(409).send({ error: "stale_tenant_context" });
        await service.archive(session, tenantId);
        return { archived: true };
      },
    );
    routes.put(
      "/api/v1/organisation/members",
      { bodyLimit: 4096 },
      async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const input = z
          .object({
            userId: z.uuid(),
            roles: z
              .array(z.enum(["platform-engineer", "application-owner"]))
              .min(1)
              .max(2),
            manageMembers: z.boolean(),
          })
          .strict()
          .parse(request.body);
        if (request.headers["x-lzc-tenant"] !== session.tenantId)
          return reply.code(409).send({ error: "stale_tenant_context" });
        await service.editMember(
          session,
          input.userId,
          [...new Set(input.roles)],
          input.manageMembers,
        );
        return { saved: true };
      },
    );
    routes.delete(
      "/api/v1/organisation/members/:userId",
      async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const input = z
          .object({ userId: z.uuid() })
          .strict()
          .parse(request.params);
        if (request.headers["x-lzc-tenant"] !== session.tenantId)
          return reply.code(409).send({ error: "stale_tenant_context" });
        await service.editMember(session, input.userId, [], false, true);
        return { removed: true };
      },
    );
  });
}
