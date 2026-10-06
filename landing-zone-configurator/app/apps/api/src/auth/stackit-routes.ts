import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { OrganisationService } from "../organisation/service.js";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "./routes.js";
import { DeviceFlowError, StackitDeviceFlow } from "./stackit-device.js";
import {
  StackitBindingError,
  type StackitIdentities,
} from "./stackit-identities.js";
import type { Session } from "./store.js";

export type StackitServices = {
  identities: Pick<StackitIdentities, "status" | "save" | "revoke"> &
    Partial<
      Pick<StackitIdentities, "bindOrganization" | "clearOrganizationProof">
    >;
  organisations: Pick<OrganisationService, "overview">;
  createFlow?: (
    organizationId?: string,
    purpose?: "login" | "proof",
  ) => StackitDeviceFlow;
};

export function registerStackitIdentity(
  app: FastifyInstance,
  auth: AuthServices,
  service: StackitServices,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  const pending = new Map<
    string,
    {
      flow: StackitDeviceFlow;
      authorization?: Awaited<ReturnType<StackitDeviceFlow["begin"]>>;
      expiresAt: number;
      saved: boolean;
      busy: boolean;
    }
  >();
  app.addHook("onClose", async () => {
    for (const entry of pending.values()) entry.flow.cancel();
    pending.clear();
  });
  app.get("/auth/stackit/proof-callback", async (request, reply) => {
    const session = await authenticatedSession(request, auth);
    const entry = session
      ? pending.get(`${session.id}:${session.tenantId}`)
      : undefined;
    if (!entry || entry.busy || !entry.flow.acceptAuthorization(request.query))
      return reply.code(400).send({ error: "invalid_stackit_callback" });
    return reply
      .header("Referrer-Policy", "no-referrer")
      .redirect(`${auth.origin}/organisation`);
  });
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_stackit_request" });
      if (error instanceof StackitBindingError)
        return reply.code(409).send({ error: error.code });
      if (error instanceof DeviceFlowError)
        return reply.code(400).send({ error: error.code });
      if ((error as { code?: string }).code === "42501")
        return reply
          .code(403)
          .send({ error: "organization_admin_proof_required" });
      if ((error as { code?: string }).code === "40001")
        return reply.code(409).send({ error: "stale_tenant_context" });
      return reply.code(503).send({ error: "stackit_identity_unavailable" });
    });
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
      if (request.headers["x-lzc-tenant"] !== session.tenantId)
        return reply.code(409).send({ error: "stale_tenant_context" });
      sessions.set(request, session);
      z.strictObject({}).parse(request.query ?? {});
      if (request.method !== "GET")
        (request.routeOptions.url ===
        "/api/v1/stackit/identity/bind-organization"
          ? z.strictObject({ confirmOrganizationBinding: z.literal(true) })
          : z.strictObject({})
        ).parse(request.body ?? {});
      for (const [key, entry] of pending) {
        if (Date.now() >= entry.expiresAt) {
          entry.flow.cancel();
          pending.delete(key);
        }
      }
    });
    routes.get("/api/v1/stackit/identity", async (request, reply) => {
      const session = sessions.get(request);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const entry = pending.get(`${session.id}:${session.tenantId}`);
      return {
        ...(await service.identities.status(session)),
        flow: entry?.flow.state() ?? { status: "idle" },
        bindingEnabled: service.identities.bindOrganization !== undefined,
        ...entry?.authorization,
      };
    });
    if (service.identities.bindOrganization) {
      routes.post(
        "/api/v1/stackit/identity/bind-organization",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session)
            return reply.code(401).send({ error: "authentication_required" });
          return service.identities.bindOrganization?.(session, request.body);
        },
      );
    }
    routes.post(
      "/api/v1/stackit/identity/start",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        const key = `${session.id}:${session.tenantId}`;
        const previous = pending.get(key);
        if (previous?.busy || previous?.flow.state().status === "waiting")
          return reply.code(409).send({ error: "flow_already_started" });
        if (!previous && pending.size >= 100)
          return reply.code(429).send({ error: "stackit_flow_limit" });
        const entry = {
          flow: new StackitDeviceFlow(),
          expiresAt: Date.now() + 900000,
          saved: false,
          busy: true,
        } as NonNullable<ReturnType<typeof pending.get>>;
        pending.set(key, entry);
        try {
          const overview = await service.organisations.overview(session);
          const tenant = overview.tenants.find(
            (value) => value.id === session.tenantId,
          );
          if (!tenant) throw new StackitBindingError("stale_tenant_context");
          const organizationId = tenant.organizationId ?? undefined;
          if (organizationId)
            await service.identities.clearOrganizationProof?.(session);
          entry.flow =
            service.createFlow?.(organizationId, "proof") ??
            new StackitDeviceFlow(fetch, Date.now, organizationId);
          entry.authorization = await entry.flow.begin();
          entry.expiresAt = Math.min(
            new Date(entry.authorization.expiresAt).getTime(),
            session.expiresAt.getTime(),
          );
          return entry.authorization;
        } catch (error) {
          entry.flow.cancel();
          pending.delete(key);
          throw error;
        } finally {
          entry.busy = false;
        }
      },
    );
    routes.post("/api/v1/stackit/identity/poll", async (request, reply) => {
      const session = sessions.get(request);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      const entry = pending.get(`${session.id}:${session.tenantId}`);
      if (!entry)
        return reply.code(409).send({ error: "stackit_flow_missing" });
      if (entry.busy) return { status: "waiting", retryAfterMs: 1000 };
      entry.busy = true;
      try {
        const state = await entry.flow.poll();
        if (state.status === "verified" && !entry.saved) {
          await service.identities.save(session, state.identity);
          entry.saved = true;
          delete entry.authorization;
        }
        return state;
      } catch (error) {
        entry.flow.cancel();
        throw error;
      } finally {
        entry.busy = false;
      }
    });
    for (const action of ["cancel", "revoke"] as const) {
      routes.post(
        `/api/v1/stackit/identity/${action}`,
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session)
            return reply.code(401).send({ error: "authentication_required" });
          const key = `${session.id}:${session.tenantId}`;
          const entry = pending.get(key);
          if (entry?.busy)
            return reply.code(409).send({ error: "stackit_flow_busy" });
          entry?.flow.cancel();
          pending.delete(key);
          if (action === "revoke") await service.identities.revoke(session);
          return { status: "cancelled" };
        },
      );
    }
  });
}
