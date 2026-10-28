import { randomUUID } from "node:crypto";
import { assistantDiscardRequestSchema } from "@lzc/contracts";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

it("authorizes proposal discard through the existing session, origin, CSRF and strict identity contract", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "",
    login: "alice",
    csrfToken: "a".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const auth = {
    origin: "https://configurator.example",
    store: { resolveSession: vi.fn(async () => session) },
  } as unknown as AuthServices;
  const conversation = {
    id: randomUUID(),
    revision: 3,
    baseRevision: 1,
    expiresAt: new Date().toISOString(),
    messages: [],
    proposal: null,
    stale: false,
    authorizesExecution: false,
  };
  const assistant = {
    get: vi.fn(async () => conversation),
    send: vi.fn(),
    accept: vi.fn(),
    remove: vi.fn(),
    discard: vi.fn(async (_session: Session, _id: string, input: unknown) => {
      assistantDiscardRequestSchema.parse(input);
      return conversation;
    }),
  };
  const app = buildApp({ auth, assistant });
  const id = randomUUID();
  const url = `/api/v1/configurations/${id}/assistant/discard`;
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
  };
  const payload = { conversationId: conversation.id, revision: 2 };
  try {
    expect(
      (await app.inject({ method: "POST", url, payload })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { ...headers, origin: "https://other.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { ...headers, "x-lzc-csrf": "wrong" },
        })
      ).statusCode,
    ).toBe(403);
    expect(assistant.discard).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { ...payload, tenantId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    assistant.discard.mockClear();
    const reply = await app.inject({ method: "POST", url, headers, payload });
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ conversation });
    expect(assistant.discard).toHaveBeenCalledExactlyOnceWith(
      session,
      id,
      payload,
    );
    expect(assistant.send).not.toHaveBeenCalled();
    expect(assistant.accept).not.toHaveBeenCalled();
    expect(assistant.remove).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
