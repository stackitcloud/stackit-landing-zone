import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { GitHubLoginClient } from "./github-client.js";
import {
  createGitHubLogin,
  newSessionToken,
  sessionCookie,
  validGitHubCallback,
} from "./github-flow.js";
import type { UserTokenStore } from "./secrets.js";
import type { AuthStore, Session } from "./store.js";

export type AuthServices = {
  origin: string;
  clientId: string;
  store: AuthStore;
  github: GitHubLoginClient;
  tokens: UserTokenStore;
  primaryStackit?: boolean;
  githubEnabled?: boolean;
  allowLoopbackHttp?: boolean;
};
export function cookie(request: FastifyRequest, name: string): string | null {
  const matches = (request.headers.cookie ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]?.slice(name.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
const clearBinding =
  "__Host-lzc-login=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
const clearSession =
  "__Host-lzc-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
const resolvedSessions = new WeakMap<
  FastifyRequest,
  Map<AuthServices, Promise<Session | null>>
>();
export function validMutation(
  request: FastifyRequest,
  session: Session,
  origin: string,
): boolean {
  const csrf = request.headers["x-lzc-csrf"];
  return (
    request.headers.origin === origin &&
    typeof csrf === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(csrf) &&
    timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrfToken))
  );
}
export async function authenticatedSession(
  request: FastifyRequest,
  services: AuthServices,
): Promise<Session | null> {
  let cached = resolvedSessions.get(request);
  if (!cached) {
    cached = new Map();
    resolvedSessions.set(request, cached);
  }
  const existing = cached.get(services);
  if (existing) return existing;
  const token = cookie(request, "__Host-lzc-session");
  const resolution = token
    ? services.store.resolveSession(token)
    : Promise.resolve(null);
  cached.set(services, resolution);
  return resolution;
}
export function registerAuth(app: FastifyInstance, services: AuthServices) {
  const origin = new URL(services.origin);
  const localHttp =
    services.allowLoopbackHttp === true &&
    origin.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(origin.hostname);
  if (
    (!localHttp && origin.protocol !== "https:") ||
    origin.origin !== services.origin
  )
    throw new Error("Canonical HTTPS origin required");
  const callback = `${services.origin}/auth/github/callback`;
  let starts = 0,
    windowStart = Date.now();
  app.get("/auth/github/start", async (_request, reply) => {
    if (services.primaryStackit || services.githubEnabled === false)
      return reply
        .code(409)
        .send({ error: "github_connection_requires_session" });
    // Coarse per-instance cap, independent of untrusted forwarded headers. A
    // distributed abuse limit is needed before expanding beyond the MVP.
    if (Date.now() - windowStart > 60000) {
      starts = 0;
      windowStart = Date.now();
    }
    if (++starts > 300)
      return reply
        .header("Retry-After", "60")
        .code(429)
        .send({ error: "login_rate_limited" });
    const login = createGitHubLogin(services.clientId, callback);
    await services.store.beginLogin(login.pending);
    reply.header(
      "Set-Cookie",
      `__Host-lzc-login=${login.cookieBinding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    );
    return reply.redirect(login.authorizationUrl);
  });
  app.post(
    "/auth/github/connect",
    { bodyLimit: 1024 },
    async (request, reply) => {
      if (services.githubEnabled === false)
        return reply.code(503).send({ error: "github_not_configured" });
      const session = await authenticatedSession(request, services);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (!validMutation(request, session, services.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      if (
        !z.strictObject({}).safeParse(request.body ?? {}).success ||
        !z.strictObject({}).safeParse(request.query ?? {}).success
      )
        return reply.code(400).send({ error: "invalid_github_request" });
      if (Date.now() - windowStart >= 60000) {
        starts = 0;
        windowStart = Date.now();
      }
      if (++starts > 300)
        return reply
          .header("Retry-After", "60")
          .code(429)
          .send({ error: "login_rate_limited" });
      const login = createGitHubLogin(services.clientId, callback);
      await services.store.beginLogin(login.pending, session);
      reply.header(
        "Set-Cookie",
        `__Host-lzc-login=${login.cookieBinding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      );
      return { authorizationUrl: login.authorizationUrl };
    },
  );
  app.get("/auth/github/status", async (request, reply) => {
    const session = await authenticatedSession(request, services);
    if (!session)
      return reply.code(401).send({ error: "authentication_required" });
    try {
      if (!session.githubId) return { connected: false };
      await services.tokens.get(session);
      return { connected: true };
    } catch {
      return { connected: false };
    }
  });
  app.get("/auth/github/callback", async (request, reply) => {
    reply.header("Set-Cookie", clearBinding);
    const query = request.query as Record<string, unknown>;
    const binding = cookie(request, "__Host-lzc-login");
    if (
      typeof query.state !== "string" ||
      typeof query.code !== "string" ||
      query.code.length > 256 ||
      !/^[a-zA-Z0-9_-]+$/.test(query.code) ||
      !binding ||
      query.error
    )
      return reply.redirect("/?login=failed");
    let session: Session | undefined;
    const secret = newSessionToken();
    try {
      const pending = await services.store.consumeLogin(query.state, binding);
      if (!pending || !validGitHubCallback(pending, query.state, binding))
        return reply.redirect("/?login=failed");
      if (services.githubEnabled === false)
        return reply.redirect("/?github=failed");
      if (services.primaryStackit || pending.linkedSessionId) {
        const current = await authenticatedSession(request, services);
        if (
          !current ||
          current.id !== pending.linkedSessionId ||
          !services.store.linkGitHub
        )
          return reply.redirect("/?github=failed");
        const authorization = await services.github.authorize(
          query.code,
          pending.verifier,
        );
        const linked = await services.store.linkGitHub(
          current,
          authorization.githubId,
          authorization.login,
        );
        await services.tokens.remove(linked);
        await services.tokens.put(
          {
            ...linked,
            expiresAt: new Date(
              Math.min(
                linked.expiresAt.getTime(),
                Date.now() + (authorization.expiresIn - 30) * 1000,
              ),
            ),
          },
          authorization.accessToken,
        );
        return reply.redirect("/repositories");
      }
      const authorization = await services.github.authorize(
        query.code,
        pending.verifier,
      );
      const duration = authorization.expiresIn - 30;
      session = await services.store.createSession({
        githubId: authorization.githubId,
        login: authorization.login,
        id: randomUUID(),
        hash: secret.hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + duration * 1000),
      });
      await services.tokens.put(session, authorization.accessToken);
      const old = cookie(request, "__Host-lzc-session");
      if (old) {
        const previous = await services.store.resolveSession(old);
        await services.store.deleteSession(old);
        if (previous)
          await services.tokens.remove(previous).catch(() => {
            app.log.warn(
              { event: "github_secret_cleanup_pending" },
              "Revoked session requires secret cleanup",
            );
          });
      }
      reply.header("Set-Cookie", [
        clearBinding,
        sessionCookie(secret.token, duration),
      ]);
      return reply.redirect("/");
    } catch {
      if (session) {
        await services.store.deleteSession(secret.token).catch(() => {});
        await services.tokens.remove(session).catch(() => {});
      }
      app.log.warn({ event: "github_login_failed" }, "GitHub login failed");
      return reply.redirect("/?login=failed");
    }
  });
  app.post("/auth/logout", async (request, reply) => {
    const session = await authenticatedSession(request, services);
    const token = cookie(request, "__Host-lzc-session");
    if (!session || !token)
      return reply.code(401).send({ error: "authentication_required" });
    if (!validMutation(request, session, services.origin))
      return reply.code(403).send({ error: "invalid_request_origin_or_csrf" });
    await services.store.deleteSession(token);
    reply.header("Set-Cookie", clearSession);
    try {
      if (session.githubId) await services.tokens.remove(session);
    } catch {
      app.log.warn(
        { event: "github_secret_cleanup_pending" },
        "Expired/revoked session requires secret cleanup",
      );
    }
    return reply.code(204).send();
  });
}
