import type { HealthResponse } from "@lzc/contracts";
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
    bodyLimit: 1024 * 1024,
  });

  app.get(
    "/healthz",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "landing-zone-configurator",
      authentication: "not-configured",
    }),
  );

  // Until real sessions exist, no identity can be supplied through client headers.
  app.register(
    async (protectedApi) => {
      protectedApi.addHook("onRequest", async (_request, reply) => {
        return reply.code(401).send({ error: "authentication_required" });
      });
      protectedApi.get("/session", async () => ({}));
    },
    { prefix: "/api/v1" },
  );

  return app;
}
