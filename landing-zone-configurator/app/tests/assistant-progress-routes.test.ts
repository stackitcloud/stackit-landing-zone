import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AssistantConversations } from "../apps/api/src/assistant/service.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

it("negotiates fixed progress events without exposing unchecked answers to older clients", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "test",
    store: {
      resolveSession: vi.fn(async () => session),
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const conversation = {
    id: randomUUID(),
    revision: 1,
    baseRevision: 1,
    expiresAt: new Date().toISOString(),
    messages: [],
    proposal: null,
    stale: false,
    authorizesExecution: false as const,
  };
  const send = vi.fn<AssistantConversations["send"]>(
    async (_session, _id, _revision, _text, stream) => {
      stream?.onProgress?.("catalogues");
      stream?.onProgress?.("checking");
      return conversation;
    },
  );
  const app = await buildApp({
    auth,
    assistant: {
      get: vi.fn(),
      send,
      accept: vi.fn(),
      discard: vi.fn(),
      remove: vi.fn(),
    },
  });
  try {
    for (const negotiated of [false, true]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/configurations/${randomUUID()}/assistant`,
        headers: {
          cookie: `__Host-lzc-session=${"b".repeat(43)}`,
          origin: auth.origin,
          "x-lzc-csrf": session.csrfToken,
          accept: "application/x-ndjson",
          ...(negotiated ? { "x-lzc-assistant-progress": "1" } : {}),
        },
        payload: { revision: 1, message: "Explain Git limits only." },
      });
      expect(response.statusCode).toBe(200);
      const events = response.body
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        events
          .filter((event) => event.type === "progress")
          .map((event) => event.phase),
      ).toEqual(negotiated ? ["preparing", "catalogues", "checking"] : []);
      expect(events.filter((event) => event.type === "text")).toEqual([]);
      expect(events.at(-1)).toEqual({
        type: "complete",
        data: { conversation },
      });
    }
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
  }
});
