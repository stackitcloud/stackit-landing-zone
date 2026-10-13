import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import { chatMessageSchema } from "./dialogue.js";
import {
  AssistantInferenceError,
  type AssistantStream,
} from "./model-serving.js";
import { type AssistantConversations, AssistantError } from "./service.js";

function sendStream(
  request: FastifyRequest,
  reply: FastifyReply,
  task: (stream: AssistantStream) => Promise<unknown>,
) {
  const output = new PassThrough({ highWaterMark: 1048576 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  reply.raw.on("close", abort);
  const write = (value: unknown) => {
    if (controller.signal.aborted) return;
    if (!output.write(`${JSON.stringify(value)}\n`)) {
      controller.abort();
      output.destroy();
    }
  };
  reply.header("Content-Type", "application/x-ndjson");
  reply.header("Cache-Control", "no-store");
  reply.header("X-Accel-Buffering", "no");
  void task({
    signal: controller.signal,
    onText: (text) => write({ type: "text", text }),
  })
    .then((data) => write({ type: "complete", data }))
    .catch((error) => {
      let code = "assistant_unavailable";
      if (error instanceof AssistantInferenceError) {
        request.log.warn(
          { event: "assistant_inference_failed", reason: error.reason },
          "Assistant inference rejected",
        );
        code = "assistant_inference_failed";
      } else if (error instanceof AssistantError) code = error.code;
      else if (error instanceof z.ZodError) code = "assistant_invalid_request";
      else if (error?.code === "42501") code = "configuration_access_denied";
      write({ type: "error", error: code });
    })
    .finally(() => {
      output.end();
    });
  return reply.send(output);
}

export function registerAssistant(
  app: FastifyInstance,
  auth: AuthServices,
  assistant: Pick<
    AssistantConversations,
    "get" | "send" | "accept" | "remove"
  > &
    Partial<
      Pick<
        AssistantConversations,
        | "getTemplateAdvice"
        | "sendTemplateAdvice"
        | "removeTemplateAdvice"
        | "preview"
      >
    >,
) {
  app.register(async (routes) => {
    routes.setErrorHandler((error, request, reply) => {
      if (error instanceof AssistantInferenceError) {
        request.log.warn(
          { event: "assistant_inference_failed", reason: error.reason },
          "Assistant inference rejected",
        );
        return reply.code(503).send({ error: "assistant_inference_failed" });
      }
      if (error instanceof AssistantError)
        return reply
          .code(error.status)
          .send({ error: error.code, ...error.details });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "assistant_invalid_request" });
      if ((error as { code?: string }).code === "42501")
        return reply.code(403).send({ error: "configuration_access_denied" });
      return reply.code(503).send({ error: "assistant_unavailable" });
    });
    routes.addHook("preHandler", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (
        request.method !== "GET" &&
        !validMutation(request, session, auth.origin)
      )
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
    });
    if (
      assistant.getTemplateAdvice &&
      assistant.sendTemplateAdvice &&
      assistant.removeTemplateAdvice
    ) {
      const advicePath = "/api/v1/configurations/template-advice";
      for (const method of ["GET", "POST", "DELETE"] as const)
        routes.route({
          method,
          url: advicePath,
          handler: async (request, reply) => {
            const session = await authenticatedSession(request, auth);
            if (!session)
              return reply.code(401).send({ error: "authentication_required" });
            if (method === "GET")
              return { advice: await assistant.getTemplateAdvice?.(session) };
            if (method === "DELETE") {
              await assistant.removeTemplateAdvice?.(session);
              return reply.code(204).send();
            }
            const { message } = z
              .strictObject({ message: chatMessageSchema })
              .parse(request.body);
            if (request.headers.accept === "application/x-ndjson")
              return sendStream(request, reply, async (stream) => ({
                advice: await assistant.sendTemplateAdvice?.(
                  session,
                  message,
                  stream,
                ),
              }));
            return {
              advice: await assistant.sendTemplateAdvice?.(session, message),
            };
          },
        });
    }
    const prefix = "/api/v1/configurations/:id/assistant";
    for (const action of ["get", "send", "accept", "remove"] as const) {
      routes.route({
        method:
          action === "get" ? "GET" : action === "remove" ? "DELETE" : "POST",
        url: action === "accept" ? `${prefix}/accept` : prefix,
        handler: async (request, reply) => {
          const session = await authenticatedSession(request, auth);
          if (!session)
            return reply.code(401).send({ error: "authentication_required" });
          const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
          if (action === "get")
            return { conversation: await assistant.get(session, id) };
          if (action === "remove") {
            await assistant.remove(session, id);
            return reply.code(204).send();
          }
          if (action === "send") {
            const { revision, message, draft } = z
              .strictObject({
                revision: z.number().int().positive(),
                message: chatMessageSchema,
                draft: z.unknown().optional(),
              })
              .parse(request.body);
            if (request.headers.accept === "application/x-ndjson")
              return sendStream(request, reply, async (stream) => ({
                conversation: await assistant.send(
                  session,
                  id,
                  revision,
                  message,
                  stream,
                  draft,
                ),
              }));
            return {
              conversation: await assistant.send(
                session,
                id,
                revision,
                message,
                undefined,
                draft,
              ),
            };
          }
          const {
            revision,
            baseRevision,
            selectedFields,
            draft,
            savedDraft,
            confirmedRevision,
          } = z
            .strictObject({
              revision: z.number().int().positive(),
              baseRevision: z.number().int().positive(),
              selectedFields: z
                .array(z.string().min(1).max(512))
                .min(1)
                .max(2048)
                .optional(),
              draft: z.unknown().optional(),
              savedDraft: z.unknown().optional(),
              confirmedRevision: z.number().int().positive().optional(),
            })
            .parse(request.body);
          if (draft !== undefined || savedDraft !== undefined) {
            if (draft === undefined || savedDraft === undefined)
              throw new AssistantError(400, "assistant_invalid_request");
            if (!assistant.preview)
              throw new AssistantError(503, "assistant_unavailable");
            return assistant.preview(
              session,
              id,
              revision,
              baseRevision,
              selectedFields,
              draft,
              savedDraft,
              confirmedRevision,
            );
          }
          if (confirmedRevision !== undefined)
            throw new AssistantError(400, "assistant_invalid_request");
          return {
            configuration: await assistant.accept(
              session,
              id,
              revision,
              baseRevision,
              selectedFields,
            ),
          };
        },
      });
    }
  });
}
