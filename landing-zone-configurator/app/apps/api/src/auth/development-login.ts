import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sessionCookie } from "./github-flow.js";
import type { AuthServices } from "./routes.js";

export type DevelopmentLogin = {
  authenticate(username: string, password: string): Promise<string | null>;
};

export function registerDevelopmentLogin(
  app: FastifyInstance,
  auth: AuthServices,
  login: DevelopmentLogin,
) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VCAP_APPLICATION ||
    new URL(auth.origin).protocol !== "https:" ||
    auth.primaryStackit ||
    auth.githubEnabled !== false
  )
    throw new Error("development_login_requires_separate_https_workstation");
  let attempts = 0;
  let windowStart = Date.now();
  app.post(
    "/auth/development/login",
    { bodyLimit: 2048 },
    async (request, reply) => {
      if (request.headers.origin !== auth.origin)
        return reply.code(403).send({ error: "invalid_request_origin" });
      if (Date.now() - windowStart >= 15 * 60000) {
        attempts = 0;
        windowStart = Date.now();
      }
      if (++attempts > 10)
        return reply
          .header("Retry-After", "900")
          .code(429)
          .send({ error: "development_login_rate_limited" });
      const input = z
        .strictObject({
          username: z.string().min(1).max(100),
          password: z.string().min(1).max(1024),
        })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_development_login" });
      const token = await login.authenticate(
        input.data.username,
        input.data.password,
      );
      if (!token)
        return reply.code(401).send({ error: "invalid_development_login" });
      attempts = 0;
      reply.header("Set-Cookie", sessionCookie(token, 8 * 3600));
      return reply.send({ authenticated: true, development: true });
    },
  );
}
