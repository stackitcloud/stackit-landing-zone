import { platformApplySchema } from "@lzc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { CredentialError } from "../credentials/profiles.js";
import { RepositoryError } from "../github/repositories.js";
import type { Plans } from "./service.js";
export type PlanRoutesServices = Pick<
  Plans,
  "list" | "start" | "cancel" | "input" | "stage" | "result"
> &
  Partial<
    Pick<
      Plans,
      | "apply"
      | "artifact"
      | "state"
      | "outputs"
      | "output"
      | "recordOutput"
      | "migration"
      | "recovery"
      | "revokeCredentialGrant"
    >
  >;
export function registerPlans(
  app: FastifyInstance,
  auth: AuthServices,
  plans: PlanRoutesServices,
) {
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (
        error instanceof CredentialError &&
        error.code === "legacy_state_migration_required"
      )
        return reply.code(error.status).send({
          error: error.code,
          action:
            "Explicitly map and re-encrypt the existing legacy state for this tenant and configuration before retrying. No new state was created.",
        });
      if (error instanceof CredentialError || error instanceof RepositoryError)
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_plan_request" });
      app.log.warn({ event: "plan_request_failed" }, "Plan request failed");
      return reply.code(503).send({ error: "plan_request_failed" });
    });
    routes.register(async (user) => {
      user.addHook("preHandler", async (request, reply) => {
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
      user.get("/api/v1/plans", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        return { runs: await plans.list(session) };
      });
      if (plans.output)
        user.get("/api/v1/plans/:id/output", async (request, reply) => {
          const session = await authenticatedSession(request, auth);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          reply.header("Cache-Control", "private, no-store");
          return plans.output!(session, id);
        });
      user.post("/api/v1/plans", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        const input = z
          .union([
            z.strictObject({
              preparationId: z.uuid(),
              confirmStateBinding: z.literal(true),
            }),
            z
              .object({
                preparationId: z.uuid(),
                confirmNewDeployment: z.literal(true),
              })
              .strict(),
          ])
          .parse(request.body);
        return reply
          .code(202)
          .send(
            await plans.start(
              session,
              () => auth.tokens.get(session),
              input.preparationId,
            ),
          );
      });
      user.post("/api/v1/plans/:id/cancel", async (request, reply) => {
        const session = await authenticatedSession(request, auth);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        await plans.cancel(session, id);
        return reply.code(204).send();
      });
      if (plans.revokeCredentialGrant)
        user.post(
          "/api/v1/plans/:id/credential-grant/revoke",
          { bodyLimit: 1024 },
          async (request, reply) => {
            const session = await authenticatedSession(request, auth);
            if (!session) return reply.code(401).send();
            if (request.headers["x-lzc-tenant"] !== session.tenantId)
              return reply.code(409).send({ error: "stale_tenant_context" });
            const { id } = z.object({ id: z.uuid() }).parse(request.params);
            return plans.revokeCredentialGrant?.(session, id, request.body);
          },
        );
      if (plans.apply)
        user.post("/api/v1/plans/:id/apply", async (request, reply) => {
          const session = await authenticatedSession(request, auth);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          const input = platformApplySchema.parse(request.body);
          return reply
            .code(202)
            .send(
              await plans.apply!(
                session,
                () => auth.tokens.get(session),
                id,
                input,
              ),
            );
        });
      if (plans.outputs)
        user.get("/api/v1/plans/:id/outputs", async (request, reply) => {
          const session = await authenticatedSession(request, auth);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return plans.outputs!(session, id);
        });
    });
    const ticket = (authorization: string | undefined) => {
      if (!authorization?.startsWith("Bearer "))
        throw new CredentialError(401, "invalid_runner_ticket");
      return authorization.slice(7);
    };
    routes.post("/api/runner/input", async (request) =>
      plans.input(ticket(request.headers.authorization)),
    );
    routes.post("/api/runner/stage", async (request, reply) => {
      const { stage } = z
        .object({ stage: z.string() })
        .strict()
        .parse(request.body);
      await plans.stage(ticket(request.headers.authorization), stage);
      return reply.code(204).send();
    });
    routes.post("/api/runner/result", async (request, reply) => {
      await plans.result(ticket(request.headers.authorization), request.body);
      return reply.code(204).send();
    });
    if (plans.recordOutput)
      routes.post(
        "/api/runner/output",
        { bodyLimit: 12 * 1024 * 1024 },
        async (request, reply) => {
          await plans.recordOutput!(
            ticket(request.headers.authorization),
            request.body,
          );
          return reply.code(204).send();
        },
      );
    if (plans.artifact)
      routes.post(
        "/api/runner/artifact",
        { bodyLimit: 22 * 1024 * 1024 + 65536 },
        async (request) =>
          plans.artifact!(ticket(request.headers.authorization), request.body),
      );
    if (plans.migration)
      routes.post(
        "/api/runner/migration",
        { bodyLimit: 1024 },
        async (request) =>
          plans.migration!(
            ticket(request.headers.authorization),
            z
              .strictObject({ phase: z.enum(["prepare", "complete"]) })
              .parse(request.body),
          ),
      );
    if (plans.recovery)
      routes.post(
        "/api/runner/recovery",
        { bodyLimit: 22 * 1024 * 1024 + 1024 },
        async (request) =>
          plans.recovery!(
            ticket(request.headers.authorization),
            z
              .strictObject({
                data: z
                  .string()
                  .min(4)
                  .max(22 * 1024 * 1024),
                sha256: z.string().regex(/^[0-9a-f]{64}$/),
              })
              .parse(request.body),
          ),
      );
    const backendTicket = (authorization: string | undefined) => {
      if (!authorization?.startsWith("Basic "))
        throw new CredentialError(401, "invalid_runner_ticket");
      const encoded = authorization.slice(6);
      const decoded = Buffer.from(encoded, "base64");
      if (
        decoded.toString("base64") !== encoded ||
        !/^runner:[A-Za-z0-9_-]{43}$/.test(decoded.toString("utf8"))
      )
        throw new CredentialError(401, "invalid_runner_ticket");
      return decoded.toString("utf8").slice(7);
    };
    if (plans.state) {
      routes.get("/api/runner/state", async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const state = await plans.state!(
          backendTicket(request.headers.authorization),
          "read",
        );
        return state === null ? reply.code(404).send() : state;
      });
      routes.post(
        "/api/runner/state",
        { bodyLimit: 16 * 1024 * 1024 },
        async (request, reply) => {
          const query = z
            .object({ ID: z.string().min(1).max(128) })
            .parse(request.query);
          await plans.state!(
            backendTicket(request.headers.authorization),
            "write",
            request.body,
            query.ID,
          );
          return reply.code(200).send();
        },
      );
      for (const action of ["lock", "unlock"] as const)
        routes.post(`/api/runner/state/${action}`, async (request, reply) => {
          const input = z
            .object({ ID: z.string().min(1).max(128) })
            .parse(request.body);
          await plans.state!(
            backendTicket(request.headers.authorization),
            action,
            undefined,
            input.ID,
          );
          return reply.code(200).send();
        });
    }
  });
}
