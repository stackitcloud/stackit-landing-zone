import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@lzc/contracts";
import { catalogue } from "@lzc/domain";
import Fastify, { LogController } from "fastify";
import { registerApplications } from "./applications/routes.js";
import type { Applications } from "./applications/service.js";
import { platformAccessError } from "./auth/platform-access.js";
import {
  type AuthServices,
  authenticatedSession,
  registerAuth,
} from "./auth/routes.js";
import { registerStackitLogin } from "./auth/stackit-login.js";
import {
  registerStackitIdentity,
  type StackitServices,
} from "./auth/stackit-routes.js";
import { registerConfigurations } from "./configurations/routes.js";
import type { Configurations } from "./configurations/service.js";
import { registerCloudCatalogues } from "./credentials/catalogue-routes.js";
import type { PostgresCloudCatalogues } from "./credentials/catalogues.js";
import type { CredentialProfiles } from "./credentials/profiles.js";
import { registerCredentials } from "./credentials/routes.js";
import { registerBackends } from "./deployments/backend-routes.js";
import type { Backends } from "./deployments/backends.js";
import type { Preparations } from "./deployments/preparations.js";
import { registerPreparations } from "./deployments/routes.js";
import type { Repositories } from "./github/repositories.js";
import { registerRepositories } from "./github/routes.js";
import {
  type Invitations,
  registerInvitations,
} from "./organisation/invitations.js";
import { registerOrganisations } from "./organisation/routes.js";
import type { OrganisationService } from "./organisation/service.js";
import { type PlanRoutesServices, registerPlans } from "./plans/routes.js";

export function buildApp(
  options: {
    webRoot?: string;
    configurations?: Pick<
      Configurations,
      "list" | "get" | "create" | "update" | "remove"
    >;
    applications?: Pick<
      Applications,
      | "listTemplates"
      | "publish"
      | "retire"
      | "listInstances"
      | "order"
      | "listPlatformContracts"
      | "approvePlatformContract"
      | "preparePlanInput"
    >;
    organisations?: OrganisationService;
    invitations?: Pick<Invitations, "list" | "create" | "revoke" | "use">;
    catalogues?: Pick<PostgresCloudCatalogues, "load">;
    auth?: AuthServices;
    stackit?: StackitServices;
    repositories?: Repositories;
    credentials?: CredentialProfiles;
    plans?: PlanRoutesServices;
    backends?: Pick<
      Backends,
      "list" | "register" | "configuration" | "configurationForSource"
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
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (
      !options.auth ||
      !/^\/api\/v1\/(github|configurations|credentials|preparations|plans|cloud-catalogues)(\/|$)/.test(
        path,
      )
    )
      return;
    const session = await authenticatedSession(request, options.auth);
    if (!session)
      return reply.code(401).send({ error: "authentication_required" });
    const error = platformAccessError(session, path);
    if (error) return reply.code(403).send({ error });
  });
  app.setErrorHandler((_error, _request, reply) => {
    app.log.error({ event: "request_failed" }, "Request failed");
    return reply.code(503).send({ error: "service_unavailable" });
  });
  app.get("/auth/status", async () => ({
    github: !!options.auth && options.auth.githubEnabled !== false,
    stackit: !!options.stackit,
    primary: options.auth?.primaryStackit ? "stackit" : "github",
  }));
  if (options.auth) {
    registerAuth(app, options.auth);
    if (options.configurations)
      registerConfigurations(app, options.auth, options.configurations);
    if (options.stackit)
      registerStackitIdentity(app, options.auth, options.stackit);
    if (options.auth.primaryStackit && options.stackit)
      registerStackitLogin(
        app,
        options.auth,
        options.stackit.createFlow
          ? () => options.stackit!.createFlow!()
          : undefined,
      );
    if (options.applications)
      registerApplications(app, options.auth, options.applications);
    if (options.invitations)
      registerInvitations(app, options.auth, options.invitations);
    if (options.organisations)
      registerOrganisations(app, options.auth, options.organisations);
    if (options.catalogues)
      registerCloudCatalogues(app, options.auth, options.catalogues);
    if (options.plans) registerPlans(app, options.auth, options.plans);
    if (options.backends) registerBackends(app, options.auth, options.backends);
    if (options.preparations)
      registerPreparations(app, options.auth, options.preparations);
    if (options.credentials)
      registerCredentials(app, options.auth, options.credentials);
    registerRepositories(
      app,
      options.auth,
      options.repositories,
      options.backends,
    );
  }
  app.get(
    "/healthz",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "landing-zone-configurator",
      authentication: options.auth
        ? options.auth.primaryStackit
          ? "stackit"
          : "github"
        : "not-configured",
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
          tenant: {
            id: session.tenantId,
            kind: session.tenantKind ?? "personal",
            roles: session.productRoles ?? [],
            manageMembers: session.manageMembers ?? false,
          },
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt.toISOString(),
          ...(options.auth?.primaryStackit && options.stackit
            ? {
                stackitVerified: (
                  await options.stackit.identities.status(session)
                ).verified,
              }
            : {}),
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
      "/organisation",
      "/applications",
      "/configurations/edit",
      "/configurations/edit/basics",
      "/configurations/edit/projects",
      "/configurations/edit/folders",
      "/configurations/edit/network",
      "/configurations/edit/platform",
      "/configurations/edit/operations",
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
