import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { newSessionToken, sessionCookie } from "./github-flow.js";
import { PendingFlows } from "./pending-flows.js";
import {
  type AuthServices,
  authenticatedSession,
  cookie,
  validMutation,
} from "./routes.js";
import { StackitDeviceFlow } from "./stackit-device.js";

export function registerStackitLogin(
  app: FastifyInstance,
  auth: AuthServices,
  createFlow: () => StackitDeviceFlow = () => new StackitDeviceFlow(),
) {
  const pending = new PendingFlows(
    auth.origin,
    "login",
    createFlow,
    auth.pendingFlows,
  );
  let starts = 0;
  let windowStart = Date.now();
  const clear =
    "__Host-lzc-device=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
  const requestKey = (request: FastifyRequest) =>
    cookie(request, "__Host-lzc-device");
  app.get("/auth/stackit/callback", async (request, reply) => {
    const key = requestKey(request);
    const entry = key ? await pending.get(key) : undefined;
    if (!key || !entry || entry.busy)
      return reply.code(400).send({ error: "invalid_stackit_callback" });
    try {
      if (!entry.flow.acceptAuthorization(request.query))
        return reply.code(400).send({ error: "invalid_stackit_callback" });
    } finally {
      await pending.release(key, entry);
    }
    return reply
      .header("Referrer-Policy", "no-referrer")
      .redirect(new URL("/#stackit-login", auth.origin).toString());
  });
  app.register(async (routes) => {
    routes.setErrorHandler((_error, _request, reply) =>
      reply.code(503).send({ error: "stackit_login_unavailable" }),
    );
    routes.addHook("preHandler", async (request, reply) => {
      if (request.headers.origin !== auth.origin)
        return reply.code(403).send({ error: "invalid_request_origin" });
      if (
        !z.strictObject({}).safeParse(request.body ?? {}).success ||
        !z.strictObject({}).safeParse(request.query ?? {}).success
      )
        return reply.code(400).send({ error: "invalid_login_request" });
    });
    routes.post(
      "/auth/stackit/start",
      { bodyLimit: 1024 },
      async (request, reply) => {
        if (!auth.store.createStackitSession)
          return reply.code(503).send({ error: "stackit_login_unavailable" });
        const existing = await authenticatedSession(request, auth);
        if (existing && !validMutation(request, existing, auth.origin))
          return reply
            .code(403)
            .send({ error: "invalid_request_origin_or_csrf" });
        const previous = requestKey(request);
        if (previous && (await pending.read(previous)))
          return reply.code(409).send({ error: "flow_already_started" });
        if (Date.now() - windowStart >= 60000) {
          starts = 0;
          windowStart = Date.now();
        }
        if (++starts > 300)
          return reply
            .header("Retry-After", "60")
            .code(429)
            .send({ error: "login_rate_limited" });
        const key = randomBytes(32).toString("base64url");
        const entry = {
          flow: createFlow(),
          busy: true,
          expiresAt: Date.now() + 900000,
          existingSessionId: existing?.id ?? null,
        };
        if (!(await pending.set(key, entry)))
          return reply
            .header("Retry-After", "60")
            .code(429)
            .send({ error: "login_rate_limited" });
        try {
          const authorization = await entry.flow.begin();
          entry.expiresAt = Date.parse(authorization.expiresAt);
          reply.header(
            "Set-Cookie",
            `__Host-lzc-device=${key}; Path=/; HttpOnly; Secure; SameSite=${entry.flow.usesAuthorizationCode ? "Lax" : "Strict"}; Max-Age=${Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))}`,
          );
          return authorization;
        } catch (error) {
          entry.flow.cancel();
          await pending.delete(key, entry);
          throw error;
        } finally {
          await pending.release(key, entry);
        }
      },
    );
    routes.post("/auth/stackit/poll", async (request, reply) => {
      const key = requestKey(request);
      const entry = key ? await pending.get(key) : undefined;
      if (!key || !entry)
        return reply.code(409).send({ error: "stackit_flow_missing" });
      if (entry.busy) return { status: "waiting", retryAfterMs: 1000 };
      entry.busy = true;
      try {
        const state = await entry.flow.poll();
        if (state.status !== "verified") return state;
        const proofExpiresAt = Date.parse(state.identity.tokenExpiresAt);
        if (
          !Number.isFinite(proofExpiresAt) ||
          proofExpiresAt - 30000 <= Date.now()
        )
          throw new Error("Identity expired");
        const expiresAt = new Date(Date.now() + 8 * 3600000);
        const secret = newSessionToken();
        if (
          entry.existingSessionId &&
          (await authenticatedSession(request, auth))?.id !==
            entry.existingSessionId
        )
          throw new Error("Login binding changed");
        const created = await auth.store.createStackitSession!({
          identity: state.identity,
          id: randomUUID(),
          hash: secret.hash,
          csrfToken: randomBytes(32).toString("base64url"),
          expiresAt,
          ...(entry.existingSessionId
            ? { existingSessionId: entry.existingSessionId }
            : {}),
        });
        const grant = entry.flow.takeRefreshGrant();
        try {
          if (grant && auth.stackitSessions)
            await auth.stackitSessions.put(created, secret.hash, grant);
        } catch (error) {
          await auth.store.deleteSession(secret.token);
          throw error;
        }
        const old = cookie(request, "__Host-lzc-session");
        if (old) {
          const previous = await authenticatedSession(request, auth);
          if (previous)
            await auth.stackitSessions?.revoke(previous, old).catch(() => {});
          await auth.store.deleteSession(old);
          if (previous?.githubId)
            await auth.tokens.remove(previous).catch(() => {});
        }
        reply.header("Set-Cookie", [
          clear,
          sessionCookie(
            secret.token,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          ),
        ]);
        return { status: "verified" };
      } catch (error) {
        entry.flow.cancel();
        await pending.delete(key, entry);
        reply.header("Set-Cookie", clear);
        throw error;
      } finally {
        if (entry.flow.state().status === "verified") {
          entry.flow.cancel();
          await pending.delete(key, entry);
        }
        await pending.release(key, entry);
      }
    });
    routes.post("/auth/stackit/refresh", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      const token = cookie(request, "__Host-lzc-session");
      if (!session || !token)
        return reply.code(401).send({ error: "authentication_required" });
      if (!validMutation(request, session, auth.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      if (!auth.stackitSessions) return { status: "reauthentication-required" };
      return auth.stackitSessions.refresh(session, token);
    });
    routes.post("/auth/stackit/cancel", async (request, reply) => {
      const key = requestKey(request);
      const entry = key ? await pending.get(key) : undefined;
      if (entry?.busy)
        return reply.code(409).send({ error: "stackit_flow_busy" });
      entry?.flow.cancel();
      if (key && entry) await pending.delete(key, entry);
      reply.header("Set-Cookie", clear);
      return { status: "cancelled" };
    });
  });
}
