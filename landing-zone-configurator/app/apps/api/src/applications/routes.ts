import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Session } from "../auth/store.js";
import { ApplicationError, type Applications } from "./service.js";

export function registerApplications(
  app: FastifyInstance,
  auth: AuthServices,
  applications: Pick<
    Applications,
    | "listTemplates"
    | "publish"
    | "retire"
    | "listInstances"
    | "order"
    | "listPlatformContracts"
    | "approvePlatformContract"
    | "preparePlanInput"
  >,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ApplicationError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_application_request" });
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "42501" || error.code === "P0002")
      )
        return reply.code(403).send({ error: "application_access_denied" });
      app.log.warn(
        { event: "application_request_failed" },
        "Application request failed",
      );
      return reply.code(503).send({ error: "application_request_failed" });
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
    routes.get(
      "/api/v1/applications/platform-contracts",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return { contracts: await applications.listPlatformContracts(session) };
      },
    );
    routes.post(
      "/api/v1/applications/platform-contracts",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return applications.approvePlatformContract(session, request.body);
      },
    );
    routes.get("/api/v1/applications/templates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return {
        versions: await applications.listTemplates(session),
        retirementEnabled: true,
        deploymentPolicyEnabled: true,
      };
    });
    routes.post("/api/v1/applications/templates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return applications.publish(session, request.body);
    });
    routes.post(
      "/api/v1/applications/templates/:id/retire",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        return applications.retire(session, id, request.body);
      },
    );
    routes.get("/api/v1/applications/instances", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return { instances: await applications.listInstances(session) };
    });
    routes.post("/api/v1/applications/instances", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return applications.order(session, request.body);
    });
    routes.post(
      "/api/v1/applications/instances/:id/plan-input",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        z.strictObject({}).parse(request.body);
        return applications.preparePlanInput(session, id);
      },
    );
  });
}
