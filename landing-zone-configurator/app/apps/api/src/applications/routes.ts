import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Session } from "../auth/store.js";
import {
  ApplicationError,
  type Applications,
  applicationRunnerPackageSchema,
} from "./service.js";

export type ApplicationRunnerServices = Pick<
  Applications,
  | "runnerInput"
  | "runnerStage"
  | "runnerArtifact"
  | "runnerOutput"
  | "runnerResult"
>;

export function registerApplicationRunner(
  app: FastifyInstance,
  applications: ApplicationRunnerServices,
  input: unknown,
) {
  const binding = applicationRunnerPackageSchema.parse(input);
  const ticket = (authorization: string | undefined) => {
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))
      throw new ApplicationError(401, "invalid_application_runner_ticket");
    return authorization.slice(7);
  };
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (error instanceof ApplicationError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply
          .code(400)
          .send({ error: "invalid_application_runner_request" });
      if (error instanceof Error && "code" in error) {
        if (error.code === "40001" || error.code === "55000")
          return reply
            .code(409)
            .send({ error: "application_runner_report_conflict" });
        if (error.code === "42501" || error.code === "P0002")
          return reply
            .code(403)
            .send({ error: "application_runner_access_denied" });
      }
      app.log.warn(
        { event: "application_runner_request_failed" },
        "Application runner request failed",
      );
      return reply
        .code(503)
        .send({ error: "application_runner_request_failed" });
    });
    routes.post(
      "/api/application-runner/input",
      { bodyLimit: 1024 },
      async (request) => {
        const key = ticket(request.headers.authorization);
        z.strictObject({}).parse(request.body);
        return applications.runnerInput(key, binding);
      },
    );
    for (const { path, method, limit } of [
      { path: "stage", method: "runnerStage", limit: 1024 },
      {
        path: "artifact",
        method: "runnerArtifact",
        limit: 22 * 1024 * 1024 + 65536,
      },
      {
        path: "output",
        method: "runnerOutput",
        limit: 12 * 1024 * 1024 + 1024,
      },
      { path: "result", method: "runnerResult", limit: 65536 },
    ] as const) {
      routes.post(
        `/api/application-runner/${path}`,
        { bodyLimit: limit },
        async (request, reply) => {
          const receipt = await applications[method](
            ticket(request.headers.authorization),
            binding,
            request.body,
          );
          return method === "runnerArtifact" ? receipt : reply.code(204).send();
        },
      );
    }
  });
}

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
  > &
    Partial<
      Pick<
        Applications,
        | "prepareJob"
        | "revokeJobGrant"
        | "approveJobBackend"
        | "dispatchJob"
        | "listGroups"
        | "createGroup"
        | "deleteGroup"
        | "setGroupMembers"
        | "setTemplateGroups"
        | "appliedPlatformsEnabled"
        | "listAppliedPlatforms"
        | "previewAppliedPlatform"
        | "approveAppliedPlatform"
      >
    >,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ApplicationError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_application_request" });
      if (error instanceof Error && "code" in error && error.code === "40001") {
        const code =
          error.message === "application_instance_running"
            ? "application_instance_running"
            : "application_backend_binding_conflict";
        return reply.code(409).send({ error: code });
      }
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
    if (applications.appliedPlatformsEnabled?.()) {
      routes.get(
        "/api/v1/applications/applied-platforms",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return {
            platforms: await applications.listAppliedPlatforms?.(session),
          };
        },
      );
      routes.get(
        "/api/v1/applications/applied-platforms/:id/preview",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.previewAppliedPlatform?.(session, id);
        },
      );
      routes.post(
        "/api/v1/applications/applied-platforms/approve",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return applications.approveAppliedPlatform?.(session, request.body);
        },
      );
    }
    if (applications.listGroups)
      routes.get("/api/v1/applications/groups", async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return applications.listGroups?.(session);
      });
    if (applications.createGroup)
      routes.post(
        "/api/v1/applications/groups",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return applications.createGroup?.(session, request.body);
        },
      );
    if (applications.deleteGroup)
      routes.delete(
        "/api/v1/applications/groups/:id",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.deleteGroup?.(session, id, request.body);
        },
      );
    if (applications.setGroupMembers)
      routes.post(
        "/api/v1/applications/groups/:id/members",
        { bodyLimit: 16384 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.setGroupMembers?.(session, id, request.body);
        },
      );
    if (applications.setTemplateGroups)
      routes.post(
        "/api/v1/applications/templates/:id/groups",
        { bodyLimit: 8192 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.setTemplateGroups?.(session, id, request.body);
        },
      );
    routes.get("/api/v1/applications/templates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return {
        versions: await applications.listTemplates(session),
        retirementEnabled: true,
        deploymentPolicyEnabled: true,
        ...(applications.appliedPlatformsEnabled?.()
          ? { appliedPlatformsEnabled: true }
          : {}),
        ...(applications.listGroups && applications.setTemplateGroups
          ? { groupAccessEnabled: true }
          : {}),
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
    routes.post(
      "/api/v1/applications/instances/:id/jobs",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.prepareJob)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.prepareJob(session, id, request.body);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/credential-grant/revoke",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.revokeJobGrant)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.revokeJobGrant(session, id, request.body);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/backend-approval",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.approveJobBackend)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.approveJobBackend(session, id, request.body);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/dispatch",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.dispatchJob)
          return reply
            .code(503)
            .send({ error: "application_dispatch_disabled" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .strictObject({ confirmPlan: z.literal(true) })
          .parse(request.body);
        return reply
          .code(202)
          .send(await applications.dispatchJob(session, id, input));
      },
    );
  });
}
