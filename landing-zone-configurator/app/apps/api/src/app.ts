import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@lzc/contracts";
import { catalogue } from "@lzc/domain";
import Fastify, { LogController } from "fastify";
import {
  type AuthServices,
  authenticatedSession,
  registerAuth,
} from "./auth/routes.js";
import type { CredentialProfiles } from "./credentials/profiles.js";
import { registerCredentials } from "./credentials/routes.js";
import type { Preparations } from "./deployments/preparations.js";
import { registerPreparations } from "./deployments/routes.js";
import type { Repositories } from "./github/repositories.js";
import { registerRepositories } from "./github/routes.js";
import { registerPlans } from "./plans/routes.js";
import type { Plans } from "./plans/service.js";

export function buildApp(
  options: {
    webRoot?: string;
    auth?: AuthServices;
    repositories?: Repositories;
    credentials?: CredentialProfiles;
    plans?: Pick<
      Plans,
      "list" | "start" | "cancel" | "input" | "stage" | "result"
    >;
    preparations?: Pick<Preparations, "list" | "create" | "remove">;
  } = {},
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
  if (options.auth) {
    registerAuth(app, options.auth);
    if (options.plans) registerPlans(app, options.auth, options.plans);
    if (options.preparations)
      registerPreparations(app, options.auth, options.preparations);
    if (options.credentials)
      registerCredentials(app, options.auth, options.credentials);
    registerRepositories(app, options.auth, options.repositories);
  }
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
    // Explicit SPA routes only: API/auth errors and missing assets must remain errors.
    for (const path of [
      "/templates",
      "/repositories",
      "/credentials",
      "/deployments",
      "/configurations/edit",
      "/configurations/edit/basics",
      "/configurations/edit/projects",
      "/configurations/edit/review",
      ...catalogue.templates.map((template) => `/templates/${template.id}`),
    ]) {
      app.get(path, async (_request, reply) =>
        reply.header("Cache-Control", "no-store").sendFile("index.html"),
      );
    }
    app.register(fastifyStatic, {
      root: options.webRoot,
      index: ["index.html"],
      dotfiles: "deny",
    });
  }

  return app;
}
