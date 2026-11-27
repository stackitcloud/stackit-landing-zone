import { RetirementCloudError } from "@lzc/contracts/recovery";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import type { RetirementExecution } from "./execution.js";
import type { RetirementPreparation } from "./preparation.js";
import type { Retirements } from "./service.js";

export type RetirementExecutionRoutes = Pick<
  RetirementExecution,
  | "review"
  | "plan"
  | "apply"
  | "preview"
  | "inspect"
  | "recoveryReview"
  | "adoptRecovery"
  | "input"
  | "stage"
  | "output"
  | "jobOutput"
  | "artifact"
  | "state"
  | "result"
  | "recovery"
>;
export function registerRetirements(
  app: FastifyInstance,
  auth: AuthServices,
  retirements: Pick<Retirements, "list" | "start" | "change" | "candidates">,
  execution?: RetirementExecutionRoutes,
  preparation?: Pick<RetirementPreparation, "prepare" | "homeProject">,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (error instanceof CredentialError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof RetirementCloudError)
        return reply
          .code(error.code === "retirement_cloud_unavailable" ? 503 : 409)
          .send({ error: error.code });
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
    if (execution) {
      const params = (request: FastifyRequest) =>
        z
          .object({ id: z.uuid(), jobId: z.uuid().optional() })
          .parse(request.params);
      routes.get("/api/v1/retirements/:id/execution", async (request) =>
        execution.review(sessions.get(request)!, params(request).id),
      );
      if (preparation)
        routes.post(
          "/api/v1/retirements/:id/credential-project",
          { bodyLimit: 4096 },
          async (request) =>
            preparation.homeProject(
              sessions.get(request)!,
              params(request).id,
              request.body,
            ),
        );
      if (preparation)
        routes.post(
          "/api/v1/retirements/:id/prepare",
          { bodyLimit: 4096 },
          async (request) =>
            preparation.prepare(
              sessions.get(request)!,
              params(request).id,
              request.body,
            ),
        );
      routes.get(
        "/api/v1/retirements/:id/jobs/:jobId/output",
        async (request) => {
          const { id, jobId } = params(request);
          return execution.jobOutput(sessions.get(request)!, id, jobId!);
        },
      );
      routes.get(
        "/api/v1/retirements/:id/jobs/:jobId/recovery",
        async (request) => {
          const { id, jobId } = params(request);
          return execution.recoveryReview(sessions.get(request)!, id, jobId!);
        },
      );
      routes.post(
        "/api/v1/retirements/:id/jobs/:jobId/recovery",
        { bodyLimit: 4096 },
        async (request) => {
          const { id, jobId } = params(request);
          return execution.adoptRecovery(
            sessions.get(request)!,
            id,
            jobId!,
            request.body,
          );
        },
      );
      routes.post(
        "/api/v1/retirements/:id/plans",
        { bodyLimit: 4096 },
        async (request, reply) =>
          reply
            .code(202)
            .send(
              await execution.plan(
                sessions.get(request)!,
                params(request).id,
                request.body,
              ),
            ),
      );
      routes.get(
        "/api/v1/retirements/:id/jobs/:jobId/preview",
        async (request) => {
          const { id, jobId } = params(request);
          return execution.preview(sessions.get(request)!, id, jobId!);
        },
      );
      routes.post(
        "/api/v1/retirements/:id/jobs/:jobId/apply",
        { bodyLimit: 4096 },
        async (request, reply) => {
          const { id, jobId } = params(request);
          return reply
            .code(202)
            .send(
              await execution.apply(
                sessions.get(request)!,
                id,
                jobId!,
                request.body,
              ),
            );
        },
      );
      routes.post(
        "/api/v1/retirements/:id/jobs/:jobId/inspect",
        { bodyLimit: 4096 },
        async (request) => {
          const { id, jobId } = params(request);
          const input = z
            .strictObject({ generation: z.number().int().positive() })
            .parse(request.body);
          return execution.inspect(
            sessions.get(request)!,
            id,
            jobId!,
            input.generation,
          );
        },
      );
    }
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

/** Browser cookies never authorize runner callbacks or HTTP-State access. */
export function registerRetirementRunner(
  app: FastifyInstance,
  execution: RetirementExecutionRoutes,
) {
  app.register(async (routes) => {
    routes.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      return payload;
    });
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof CredentialError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply
          .code(400)
          .send({ error: "invalid_retirement_runner_request" });
      const e = error as { code?: string };
      return reply
        .code(
          e.code === "42501"
            ? 403
            : e.code === "40001" || e.code === "55000"
              ? 409
              : 503,
        )
        .send({ error: "retirement_runner_request_failed" });
    });
    const ticket = (request: FastifyRequest, backend = false) => {
      const header = request.headers.authorization;
      if (!backend && header?.startsWith("Bearer "))
        return z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .parse(header.slice(7));
      if (backend && header?.startsWith("Basic ")) {
        const encoded = header.slice(6),
          decoded = Buffer.from(encoded, "base64");
        if (
          decoded.toString("base64") === encoded &&
          /^runner:[A-Za-z0-9_-]{43}$/.test(decoded.toString("utf8"))
        )
          return decoded.toString("utf8").slice(7);
      }
      throw new CredentialError(401, "invalid_runner_ticket");
    };
    routes.post("/api/retirement-runner/input", async (request) =>
      execution.input(ticket(request)),
    );
    routes.post("/api/retirement-runner/stage", async (request, reply) => {
      const body = z.strictObject({ stage: z.string() }).parse(request.body);
      await execution.stage(ticket(request), body.stage);
      return reply.code(204).send();
    });
    routes.post(
      "/api/retirement-runner/output",
      { bodyLimit: 13 * 1024 * 1024 },
      async (request, reply) => {
        await execution.output(ticket(request), request.body);
        return reply.code(204).send();
      },
    );
    for (const action of ["artifact", "recovery"] as const)
      routes.post(
        `/api/retirement-runner/${action}`,
        { bodyLimit: 23 * 1024 * 1024 },
        async (request, reply) => {
          const result = await execution[action](ticket(request), request.body);
          return result ?? reply.code(204).send();
        },
      );
    routes.post(
      "/api/retirement-runner/result",
      { bodyLimit: 4 * 1024 * 1024 },
      async (request, reply) => {
        await execution.result(ticket(request), request.body);
        return reply.code(204).send();
      },
    );
    routes.get("/api/retirement-runner/state", async (request) =>
      execution.state(ticket(request, true), "read"),
    );
    routes.post(
      "/api/retirement-runner/state",
      { bodyLimit: 16 * 1024 * 1024 },
      async (request, reply) => {
        const query = z
          .object({ ID: z.string().min(1).max(128) })
          .parse(request.query);
        await execution.state(
          ticket(request, true),
          "write",
          request.body,
          query.ID,
        );
        return reply.code(200).send();
      },
    );
    for (const action of ["lock", "unlock"] as const)
      routes.post(
        `/api/retirement-runner/state/${action}`,
        async (request, reply) => {
          const body = z
            .object({ ID: z.string().min(1).max(128) })
            .parse(request.body);
          await execution.state(
            ticket(request, true),
            action,
            undefined,
            body.ID,
          );
          return reply.code(200).send();
        },
      );
  });
}
