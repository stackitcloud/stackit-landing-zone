import { configurationId, readConfigurationRecord } from "@lzc/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import {
  Repositories,
  RepositoryError,
  repositoryTarget,
} from "./repositories.js";

const selection = repositoryTarget.extend({
  id: z.coerce.number().int().positive().safe(),
});
const saveInput = z
  .object({
    target: repositoryTarget,
    head: z.string().regex(/^[a-f0-9]{40}$/),
    mode: z.enum(["create", "update"]),
    document: z.unknown(),
  })
  .strict();
export function registerRepositories(
  app: FastifyInstance,
  auth: AuthServices,
  repositories = new Repositories(),
) {
  const handle =
    (
      mutation: boolean,
      action: (request: FastifyRequest, token: string) => Promise<unknown>,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (mutation && !validMutation(request, session, auth.origin))
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      try {
        const token = await auth.tokens.get(session);
        return await action(request, token);
      } catch (error) {
        if (error instanceof RepositoryError)
          return reply.code(error.status).send({ error: error.code });
        if (error instanceof z.ZodError)
          return reply
            .code(400)
            .send({ error: "invalid_configuration_request" });
        throw error;
      }
    };
  app.get(
    "/api/v1/github/forks",
    handle(false, async (request, token) => {
      const query = z
        .object({ page: z.coerce.number().int().min(1).max(100).default(1) })
        .strict()
        .parse(request.query);
      return repositories.list(token, query.page);
    }),
  );
  app.get(
    "/api/v1/github/repository",
    handle(false, async (request, token) =>
      repositories.inspect(token, selection.parse(request.query)),
    ),
  );
  app.get(
    "/api/v1/github/configuration/:id",
    handle(false, async (request, token) => {
      const id = z.object({ id: configurationId }).parse(request.params).id;
      return repositories.load(token, selection.parse(request.query), id);
    }),
  );
  app.post(
    "/api/v1/github/configuration",
    handle(true, async (request, token) => {
      const input = saveInput.parse(request.body);
      let document: ReturnType<typeof readConfigurationRecord>;
      try {
        document = readConfigurationRecord(input.document);
      } catch {
        throw new RepositoryError(400, "invalid_configuration_document");
      }
      return repositories.save(
        token,
        input.target,
        input.head,
        input.mode,
        document,
      );
    }),
  );
}
