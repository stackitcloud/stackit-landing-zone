import { notificationPreferencesSchema } from "@lzc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Notifications } from "./service.js";
export function registerNotifications(
  app: FastifyInstance,
  auth: AuthServices,
  service: Pick<Notifications, "list" | "read" | "preferences">,
) {
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      const code = (error as { code?: string }).code;
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_notification_request" });
      return reply
        .code(code === "42501" ? 403 : code === "P0002" ? 401 : 503)
        .send({ error: "notification_operation_unavailable" });
    });
    routes.route({
      method: ["GET", "PATCH", "POST"],
      url: "/api/v1/notifications/:action",
      bodyLimit: 4096,
      handler: async (request, reply) => {
        const s = await authenticatedSession(request, auth);
        if (!s)
          return reply.code(401).send({ error: "authentication_required" });
        if (request.headers["x-lzc-tenant"] !== s.tenantId)
          return reply.code(409).send({ error: "stale_tenant_context" });
        if (request.method !== "GET" && !validMutation(request, s, auth.origin))
          return reply
            .code(403)
            .send({ error: "invalid_request_origin_or_csrf" });
        reply.header("cache-control", "no-store");
        const { action } = z
          .object({ action: z.enum(["inbox", "preferences", "read"]) })
          .parse(request.params);
        if (action === "inbox" && request.method === "GET") {
          const { before } = z
            .object({ before: z.iso.datetime({ offset: true }).optional() })
            .strict()
            .parse(request.query);
          return service.list(s, before);
        }
        if (action === "preferences" && request.method === "GET")
          return service.preferences(s);
        if (action === "preferences" && request.method === "PATCH")
          return service.preferences(
            s,
            notificationPreferencesSchema.parse(request.body),
          );
        if (action === "read" && request.method === "POST") {
          const { id } = z
            .strictObject({ id: z.uuid().nullable() })
            .parse(request.body);
          await service.read(s, id);
          return reply.code(204).send();
        }
        return reply.code(405).send({ error: "method_not_allowed" });
      },
    });
  });
}
