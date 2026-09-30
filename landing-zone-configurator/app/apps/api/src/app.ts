import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@lzc/contracts";
import Fastify, { LogController } from "fastify";
import {
  type AuthServices,
  authenticatedSession,
  registerAuth,
} from "./auth/routes.js";

export function buildApp(
  options: { webRoot?: string; auth?: AuthServices } = {},
) {
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
    bodyLimit: 1024 * 1024,
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    if (request.url.startsWith("/auth/") || request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((_error, _request, reply) => {
    app.log.error({ event: "request_failed" }, "Request failed");
    return reply.code(503).send({ error: "service_unavailable" });
  });
  app.get("/auth/status", async () => ({ github: !!options.auth }));
  if (options.auth) registerAuth(app, options.auth);
  app.get(
    "/healthz",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "landing-zone-configurator",
      authentication: options.auth ? "github" : "not-configured",
    }),
  );

  app.register(
    async (protectedApi) => {
      protectedApi.get("/session", async (request, reply) => {
        const session = options.auth
          ? await authenticatedSession(request, options.auth)
          : null;
        if (!session)
          return reply.code(401).send({ error: "authentication_required" });
        return {
          user: { id: session.userId, login: session.login },
          tenant: { id: session.tenantId },
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt.toISOString(),
        };
      });
    },
    { prefix: "/api/v1" },
  );

  if (options.webRoot) {
    app.register(fastifyStatic, {
      root: options.webRoot,
      index: ["index.html"],
      dotfiles: "deny",
    });
  }

  return app;
}
