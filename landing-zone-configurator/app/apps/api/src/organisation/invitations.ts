import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { type Session, tokenHash } from "../auth/store.js";
export class Invitations {
  constructor(private readonly pool: pg.Pool) {}
  async list(s: Session) {
    return (
      await this.pool.query(
        "SELECT lzc_auth.list_invitations($1,$2) AS value",
        [s.id, s.tenantId],
      )
    ).rows[0].value;
  }
  async create(s: Session, roles: string[], manage: boolean) {
    const token = randomBytes(32).toString("base64url");
    const result = await this.pool.query(
      "SELECT lzc_auth.create_invitation($1,$2,$3,$4,$5) AS value",
      [s.id, s.tenantId, tokenHash(token), roles, manage],
    );
    return { ...result.rows[0].value, token };
  }
  async revoke(s: Session, id: string) {
    await this.pool.query("SELECT lzc_auth.revoke_invitation($1,$2,$3)", [
      s.id,
      s.tenantId,
      id,
    ]);
  }
  async use(s: Session, token: string, accept: boolean) {
    return (
      await this.pool.query(
        "SELECT lzc_auth.use_invitation($1,$2,$3) AS value",
        [s.id, tokenHash(token), accept],
      )
    ).rows[0].value;
  }
}
export function registerInvitations(
  app: FastifyInstance,
  auth: AuthServices,
  service: Pick<Invitations, "list" | "create" | "revoke" | "use">,
) {
  app.register(async (routes) => {
    const sessions = new WeakMap<FastifyRequest, Session>();
    const requireSession = (request: FastifyRequest) => {
      const s = sessions.get(request);
      if (!s)
        throw Object.assign(new Error("authentication_required"), {
          code: "P0002",
        });
      return s;
    };
    routes.addHook("preHandler", async (request, reply) => {
      const s = await authenticatedSession(request, auth);
      if (!s) return reply.code(401).send({ error: "authentication_required" });
      sessions.set(request, s);
      if (request.method !== "GET" && !validMutation(request, s, auth.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      if (
        !(request.routeOptions.url ?? "").endsWith("/preview") &&
        !(request.routeOptions.url ?? "").endsWith("/accept") &&
        request.headers["x-lzc-tenant"] !== s.tenantId
      )
        return reply.code(409).send({ error: "stale_tenant_context" });
    });
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_invitation_request" });
      const code = (error as { code?: string }).code;
      const errors: Record<string, [number, string]> = {
        "42501": [403, "membership_management_forbidden"],
        "40001": [409, "stale_tenant_context"],
        "22023": [410, "invitation_unavailable"],
        "23505": [409, "already_member"],
        "23514": [400, "invalid_invitation_request"],
        P0002: [401, "authentication_required"],
      };
      const mapped = code ? errors[code] : undefined;
      return reply
        .code(mapped?.[0] ?? 503)
        .send({ error: mapped?.[1] ?? "invitation_operation_failed" });
    });
    routes.get("/api/v1/invitations", async (request) => ({
      invitations: await service.list(requireSession(request)),
    }));
    routes.post(
      "/api/v1/invitations",
      { bodyLimit: 4096 },
      async (request, reply) => {
        const input = z
          .object({
            roles: z
              .array(z.enum(["platform-engineer", "application-owner"]))
              .min(1)
              .max(2),
            manageMembers: z.boolean(),
          })
          .strict()
          .parse(request.body);
        if (input.manageMembers && !input.roles.includes("platform-engineer"))
          return reply.code(400).send({ error: "invalid_invitation_request" });
        const result = await service.create(
          requireSession(request),
          [...new Set(input.roles)],
          input.manageMembers,
        );
        return reply.code(201).send({
          id: result.id,
          expiresAt: result.expiresAt,
          url: `${auth.origin}/organisation#invite=${result.token}`,
        });
      },
    );
    routes.delete("/api/v1/invitations/:id", async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      await service.revoke(requireSession(request), id);
      return reply.code(204).send();
    });
    for (const action of ["preview", "accept"] as const)
      routes.post(
        `/api/v1/invitations/${action}`,
        { bodyLimit: 4096 },
        async (request) => {
          const { token } = z
            .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
            .strict()
            .parse(request.body);
          return service.use(
            requireSession(request),
            token,
            action === "accept",
          );
        },
      );
  });
}
