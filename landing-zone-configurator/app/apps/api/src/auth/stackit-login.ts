import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { newSessionToken, sessionCookie } from "./github-flow.js";
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
  const pending = new Map<
    string,
    {
      flow: StackitDeviceFlow;
      busy: boolean;
      expiresAt: number;
      existingSessionId: string | null;
    }
  >();
  let starts = 0;
  let windowStart = Date.now();
  const clear =
    "__Host-lzc-device=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
  const requestKey = (request: FastifyRequest) =>
    cookie(request, "__Host-lzc-device");
  app.addHook("onClose", async () => {
    for (const entry of pending.values()) entry.flow.cancel();
    pending.clear();
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
      for (const [key, entry] of pending)
        if (Date.now() >= entry.expiresAt && !entry.busy) {
          entry.flow.cancel();
          pending.delete(key);
        }
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
        if (previous && pending.has(previous))
          return reply.code(409).send({ error: "flow_already_started" });
        if (Date.now() - windowStart >= 60000) {
          starts = 0;
          windowStart = Date.now();
        }
        if (++starts > 300 || pending.size >= 100)
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
        pending.set(key, entry);
        try {
          const authorization = await entry.flow.begin();
          entry.expiresAt = Date.parse(authorization.expiresAt);
          reply.header(
            "Set-Cookie",
            `__Host-lzc-device=${key}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))}`,
          );
          return authorization;
        } catch (error) {
          entry.flow.cancel();
          pending.delete(key);
          throw error;
        } finally {
          entry.busy = false;
        }
      },
    );
    routes.post("/auth/stackit/poll", async (request, reply) => {
      const key = requestKey(request);
      const entry = key ? pending.get(key) : undefined;
      if (!key || !entry)
        return reply.code(409).send({ error: "stackit_flow_missing" });
      if (entry.busy) return { status: "waiting", retryAfterMs: 1000 };
      entry.busy = true;
      try {
        const state = await entry.flow.poll();
        if (state.status !== "verified") return state;
        const expiresAt = new Date(
          Math.min(
            Date.parse(state.identity.tokenExpiresAt) - 30000,
            Date.now() + 8 * 3600000,
          ),
        );
        if (expiresAt.getTime() <= Date.now())
          throw new Error("Identity expired");
        const secret = newSessionToken();
        if (
          entry.existingSessionId &&
          (await authenticatedSession(request, auth))?.id !==
            entry.existingSessionId
        )
          throw new Error("Login binding changed");
        await auth.store.createStackitSession!({
          identity: state.identity,
          id: randomUUID(),
          hash: secret.hash,
          csrfToken: randomBytes(32).toString("base64url"),
          expiresAt,
          ...(entry.existingSessionId
            ? { existingSessionId: entry.existingSessionId }
            : {}),
        });
        const old = cookie(request, "__Host-lzc-session");
        if (old) {
          const previous = await authenticatedSession(request, auth);
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
        pending.delete(key);
        reply.header("Set-Cookie", clear);
        throw error;
      } finally {
        entry.busy = false;
        if (entry.flow.state().status === "verified") {
          entry.flow.cancel();
          pending.delete(key);
        }
      }
    });
    routes.post("/auth/stackit/cancel", async (request, reply) => {
      const key = requestKey(request);
      const entry = key ? pending.get(key) : undefined;
      if (entry?.busy)
        return reply.code(409).send({ error: "stackit_flow_busy" });
      entry?.flow.cancel();
      if (key) pending.delete(key);
      reply.header("Set-Cookie", clear);
      return { status: "cancelled" };
    });
  });
}
